/**
 * Frontend direct upload orchestration using AWS S3 Presigned URLs
 */
document.addEventListener('DOMContentLoaded', () => {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const previewContainer = document.getElementById('preview-container');
  const imagePreview = document.getElementById('image-preview');
  const fileNameEl = document.getElementById('file-name');
  const fileSizeEl = document.getElementById('file-size');
  const fileTypeEl = document.getElementById('file-type');
  const removeBtn = document.getElementById('remove-btn');
  const uploadBtn = document.getElementById('upload-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  
  const progressContainer = document.getElementById('progress-container');
  const progressBar = document.getElementById('progress-bar');
  const progressPercentage = document.getElementById('progress-percentage');
  const progressStatus = document.getElementById('progress-status');
  const uploadSpeedEl = document.getElementById('upload-speed');
  const uploadEstimateEl = document.getElementById('upload-estimate');

  let selectedFile = null;
  let activeXhr = null;

  // Mime type validations
  const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp'
  ];
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  // Format bytes to human readable string
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Handle file validation and local preview setup
  function handleFileSelect(file) {
    if (!file) return;

    // Validate type
    if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
      window.Toast.error('Invalid File Type', 'Please select a valid image (JPG, PNG, GIF, WEBP, SVG, or BMP).');
      return;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      window.Toast.error('File Too Large', 'Maximum allowed file size is 10MB.');
      return;
    }

    selectedFile = file;

    // Populate metadata
    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = formatBytes(file.size);
    fileTypeEl.textContent = file.type;

    // Create Local URL Preview
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview.src = e.target.result;
      previewContainer.classList.remove('hidden');
      uploadBtn.removeAttribute('disabled');
      
      // Highlight dropzone border/color to show file loaded
      dropzone.classList.add('border-indigo-400', 'bg-indigo-50/10');
    };
    reader.readAsDataURL(file);
  }

  // Reset file selector state
  function resetFileSelection() {
    selectedFile = null;
    fileInput.value = '';
    previewContainer.classList.add('hidden');
    progressContainer.classList.add('hidden');
    progressBar.style.width = '0%';
    progressPercentage.textContent = '0%';
    uploadBtn.setAttribute('disabled', 'true');
    dropzone.classList.remove('border-indigo-400', 'bg-indigo-50/10');
  }

  // Drag and Drop Event Listeners
  dropzone.addEventListener('click', () => fileInput.click());
  
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-hover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-hover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-hover');
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  });

  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetFileSelection();
    window.Toast.info('Cleared Selection', 'File selection has been cleared.');
  });

  cancelBtn.addEventListener('click', () => {
    if (activeXhr) {
      activeXhr.abort();
    }
    window.location.href = '/';
  });

  // Direct Direct-to-S3 Upload Trigger
  uploadBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    // 1. Lock UI
    uploadBtn.setAttribute('disabled', 'true');
    cancelBtn.setAttribute('disabled', 'true');
    removeBtn.classList.add('hidden');
    dropzone.style.pointerEvents = 'none';

    progressContainer.classList.remove('hidden');
    progressStatus.textContent = 'Requesting S3 Presigned URL...';
    progressBar.style.width = '2%';
    progressPercentage.textContent = '2%';

    let imageId = null;

    try {
      // 2. Query express backend to get presigned URL and insert PENDING record
      const presignResponse = await fetch('/api/images/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileType: selectedFile.type,
          fileSize: selectedFile.size
        })
      });

      const responseData = await presignResponse.json();

      if (!responseData.success) {
        throw new Error(responseData.message || 'Presign request failed.');
      }

      const { uploadUrl, s3Key } = responseData.data;
      imageId = responseData.data.imageId;

      progressStatus.textContent = 'Uploading directly to Amazon S3...';

      // 3. Initiate binary upload to AWS S3 using XMLHttpRequest for progress events
      const xhr = new XMLHttpRequest();
      activeXhr = xhr;

      const startTime = Date.now();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          progressBar.style.width = `${percentComplete}%`;
          progressPercentage.textContent = `${percentComplete}%`;

          // Calculate upload speed
          const elapsedSeconds = (Date.now() - startTime) / 1000;
          if (elapsedSeconds > 0.1) {
            const bytesPerSecond = e.loaded / elapsedSeconds;
            uploadSpeedEl.textContent = `${formatBytes(bytesPerSecond)}/s`;
            
            // Calculate ETA
            const remainingBytes = e.total - e.loaded;
            const remainingSeconds = remainingBytes / bytesPerSecond;
            if (remainingSeconds > 0) {
              uploadEstimateEl.textContent = `${Math.ceil(remainingSeconds)}s remaining`;
            } else {
              uploadEstimateEl.textContent = 'Completing upload...';
            }
          }
        }
      });

      // Handle raw upload completion
      xhr.addEventListener('load', async () => {
        activeXhr = null;
        
        if (xhr.status === 200 || xhr.status === 201 || xhr.status === 204) {
          progressStatus.textContent = 'Upload complete! Confirming details with server...';
          
          // 4. Update status in local MySQL DB via backend confirmation API
          try {
            const confirmResponse = await fetch('/api/images/confirm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imageId: imageId,
                status: 'UPLOADED'
              })
            });

            const confirmData = await confirmResponse.json();

            if (confirmData.success) {
              window.Toast.success('Upload Successful', 'Image uploaded directly to S3 and stored in database!');
              progressStatus.textContent = 'Success! Redirecting back...';
              progressBar.classList.add('bg-emerald-500');
              
              // 5. Success redirect to List screen after 1.5 seconds
              setTimeout(() => {
                window.location.href = '/';
              }, 1500);
            } else {
              throw new Error(confirmData.message || 'Database confirmation failed.');
            }
          } catch (confirmErr) {
            console.error('Confirmation Error:', confirmErr);
            window.Toast.error('Confirmation Failed', 'Upload succeeded but DB update failed: ' + confirmErr.message);
            resetUploadUI();
          }
        } else {
          // S3 upload failed
          console.error('S3 Response Status:', xhr.status, xhr.responseText);
          window.Toast.error('S3 Upload Failed', `AWS S3 rejected the upload with status code ${xhr.status}.`);
          await reportUploadFailure(imageId);
          resetUploadUI();
        }
      });

      // Handle network connection failures
      xhr.addEventListener('error', async () => {
        activeXhr = null;
        window.Toast.error('Connection Error', 'A network connection issue occurred while uploading to S3.');
        await reportUploadFailure(imageId);
        resetUploadUI();
      });

      // Handle aborted uploads
      xhr.addEventListener('abort', async () => {
        activeXhr = null;
        console.log('Upload was aborted by user.');
        await reportUploadFailure(imageId);
        resetUploadUI();
      });

      // Open and transmit raw Binary Stream to S3 PUT URL
      xhr.open('PUT', uploadUrl, true);
      
      // Match Content-Type header with the S3 signature
      xhr.setRequestHeader('Content-Type', selectedFile.type);
      
      xhr.send(selectedFile);

    } catch (err) {
      console.error('Upload Error:', err);
      window.Toast.error('Upload Failed', err.message);
      if (imageId) {
        await reportUploadFailure(imageId);
      }
      resetUploadUI();
    }
  });

  // Report FAILED status back to DB
  async function reportUploadFailure(imageId) {
    if (!imageId) return;
    try {
      await fetch('/api/images/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageId: imageId,
          status: 'FAILED'
        })
      });
    } catch (e) {
      console.error('Failed to report status FAILED to backend:', e);
    }
  }

  // Restore UI to clickable states
  function resetUploadUI() {
    uploadBtn.removeAttribute('disabled');
    cancelBtn.removeAttribute('disabled');
    removeBtn.classList.remove('hidden');
    dropzone.style.pointerEvents = 'auto';
    progressStatus.textContent = 'Upload failed. Please try again.';
    progressBar.classList.add('bg-rose-500');
  }
});
