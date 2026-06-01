/**
 * Frontend direct upload orchestration using AWS S3 Presigned URLs
 * Upgraded to support parallel, high-fidelity multi-image batch uploads.
 */
document.addEventListener('DOMContentLoaded', () => {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const previewContainer = document.getElementById('preview-container');
  const uploadBtn = document.getElementById('upload-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  
  const progressContainer = document.getElementById('progress-container');
  const progressBar = document.getElementById('progress-bar');
  const progressPercentage = document.getElementById('progress-percentage');
  const progressStatus = document.getElementById('progress-status');
  const uploadSpeedEl = document.getElementById('upload-speed');
  const uploadEstimateEl = document.getElementById('upload-estimate');

  // State Management
  let selectedFiles = [];
  let isUploading = false;

  // Mime type validations
  const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp'
  ];
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file

  // Format bytes to human readable string
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Generate simple unique ID
  function generateId() {
    return 'file-' + Math.random().toString(36).substring(2, 11);
  }

  // Handle files validation and state loading
  function handleFilesSelect(files) {
    if (!files || files.length === 0) return;

    let addedCount = 0;
    let typeError = false;
    let sizeError = false;

    Array.from(files).forEach(file => {
      // Validate type
      if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
        typeError = true;
        return;
      }

      // Validate size
      if (file.size > MAX_FILE_SIZE) {
        sizeError = true;
        return;
      }

      // Avoid adding duplicate files
      const isDuplicate = selectedFiles.some(f => f.file.name === file.name && f.file.size === file.size);
      if (isDuplicate) return;

      const fileId = generateId();
      const objectUrl = URL.createObjectURL(file);

      selectedFiles.push({
        id: fileId,
        file: file,
        objectUrl: objectUrl,
        loaded: 0,
        progress: 0,
        status: 'PENDING',
        xhr: null,
        imageId: null
      });

      addedCount++;
    });

    if (typeError) {
      window.Toast.error('Invalid File Type', 'Some files were skipped. Please select valid images (JPG, PNG, GIF, WEBP, SVG, or BMP).');
    }
    if (sizeError) {
      window.Toast.error('File Too Large', 'Some files exceeded the 10MB limit and were skipped.');
    }

    if (addedCount > 0) {
      renderPreviews();
      uploadBtn.removeAttribute('disabled');
      dropzone.classList.add('border-indigo-400', 'bg-indigo-50/10');
    }
  }

  // Render dynamic multi-file cards
  function renderPreviews() {
    if (selectedFiles.length === 0) {
      previewContainer.innerHTML = '';
      previewContainer.classList.add('hidden');
      uploadBtn.setAttribute('disabled', 'true');
      dropzone.classList.remove('border-indigo-400', 'bg-indigo-50/10');
      return;
    }

    previewContainer.classList.remove('hidden');
    previewContainer.innerHTML = '';

    selectedFiles.forEach(item => {
      const card = document.createElement('div');
      card.id = `card-${item.id}`;
      card.className = 'flex flex-col bg-white/70 border border-slate-100 rounded-2xl p-4 transition-all duration-300 shadow-sm hover:border-slate-200';

      card.innerHTML = `
        <div class="flex items-center gap-4">
          <div class="relative h-14 w-14 flex-shrink-0 bg-slate-200 border border-slate-100 rounded-xl overflow-hidden shadow-sm">
            <img src="${item.objectUrl}" alt="Preview" class="h-full w-full object-cover">
          </div>
          <div class="flex-grow min-w-0">
            <p class="text-sm font-semibold text-slate-800 truncate" title="${item.file.name}">${item.file.name}</p>
            <div class="flex gap-3 text-xs text-slate-500 mt-1">
              <span>${formatBytes(item.file.size)}</span>
              <span>•</span>
              <span class="truncate max-w-[120px]">${item.file.type}</span>
            </div>
          </div>
          
          <!-- Status / Action Area -->
          <div id="status-area-${item.id}" class="flex items-center gap-2 flex-shrink-0">
            <button id="remove-btn-${item.id}" class="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all" title="Remove image">
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Mini Progress Bar inside the card -->
        <div id="mini-progress-${item.id}" class="hidden w-full mt-3">
          <div class="flex justify-between items-center mb-1 text-[10px]">
            <span id="mini-status-${item.id}" class="font-semibold text-indigo-600">Waiting...</span>
            <span id="mini-percent-${item.id}" class="font-bold text-slate-600">0%</span>
          </div>
          <div class="h-1.5 w-full bg-slate-200/50 rounded-full overflow-hidden">
            <div id="mini-bar-${item.id}" class="h-full bg-indigo-500 rounded-full w-0 transition-all duration-150"></div>
          </div>
        </div>
      `;

      previewContainer.appendChild(card);

      // Attach click event to the remove button
      const removeBtn = card.querySelector(`#remove-btn-${item.id}`);
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFile(item.id);
      });
    });
  }

  // Remove individual file from list
  function removeFile(fileId) {
    if (isUploading) return;

    const index = selectedFiles.findIndex(f => f.id === fileId);
    if (index !== -1) {
      // Revoke the object URL to release browser memory
      URL.revokeObjectURL(selectedFiles[index].objectUrl);
      selectedFiles.splice(index, 1);
      renderPreviews();
    }
  }

  // Reset file selections entirely
  function resetAll() {
    selectedFiles.forEach(f => URL.revokeObjectURL(f.objectUrl));
    selectedFiles = [];
    isUploading = false;
    fileInput.value = '';
    
    previewContainer.classList.add('hidden');
    progressContainer.classList.add('hidden');
    progressBar.className = 'h-full bg-indigo-600 rounded-full w-0 transition-all duration-150 ease-out';
    progressBar.style.width = '0%';
    progressPercentage.textContent = '0%';
    uploadBtn.setAttribute('disabled', 'true');
    dropzone.classList.remove('border-indigo-400', 'bg-indigo-50/10');
    dropzone.style.pointerEvents = 'auto';
    cancelBtn.removeAttribute('disabled');
  }

  // Drag and Drop Event Listeners
  dropzone.addEventListener('click', () => {
    if (!isUploading) fileInput.click();
  });
  
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!isUploading) dropzone.classList.add('drag-hover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-hover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-hover');
    if (!isUploading && e.dataTransfer.files.length > 0) {
      handleFilesSelect(e.dataTransfer.files);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFilesSelect(e.target.files);
    }
  });

  cancelBtn.addEventListener('click', () => {
    if (isUploading) {
      // Abort all active requests
      selectedFiles.forEach(item => {
        if (item.xhr) {
          item.xhr.abort();
        }
      });
      window.Toast.info('Uploads Aborted', 'Your batch uploads have been cancelled.');
    }
    window.location.href = '/';
  });

  // Calculate and update aggregate upload stats
  function updateAggregateProgress(startTime) {
    const totalBytes = selectedFiles.reduce((sum, item) => sum + item.file.size, 0);
    const loadedBytes = selectedFiles.reduce((sum, item) => sum + item.loaded, 0);

    const aggregatePercent = totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : 0;
    
    progressBar.style.width = `${aggregatePercent}%`;
    progressPercentage.textContent = `${aggregatePercent}%`;

    // Speed calculation
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    if (elapsedSeconds > 0.1) {
      const bytesPerSecond = loadedBytes / elapsedSeconds;
      uploadSpeedEl.textContent = `${formatBytes(bytesPerSecond)}/s`;
      
      // ETA calculation
      const remainingBytes = totalBytes - loadedBytes;
      const remainingSeconds = remainingBytes / bytesPerSecond;
      if (remainingSeconds > 0) {
        uploadEstimateEl.textContent = `${Math.ceil(remainingSeconds)}s remaining`;
      } else {
        uploadEstimateEl.textContent = 'Completing uploads...';
      }
    }
  }

  // Upload runner orchestrator
  uploadBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0 || isUploading) return;

    isUploading = true;

    // Lock global UIs
    uploadBtn.setAttribute('disabled', 'true');
    cancelBtn.setAttribute('disabled', 'true');
    dropzone.style.pointerEvents = 'none';

    // Remove individual remove buttons from preview cards
    selectedFiles.forEach(item => {
      const btn = document.getElementById(`remove-btn-${item.id}`);
      if (btn) btn.classList.add('hidden');

      const miniProg = document.getElementById(`mini-progress-${item.id}`);
      if (miniProg) miniProg.classList.remove('hidden');
    });

    progressContainer.classList.remove('hidden');
    progressStatus.textContent = `Preparing S3 channels for ${selectedFiles.length} files...`;
    progressBar.style.width = '2%';
    progressPercentage.textContent = '2%';

    const startTime = Date.now();
    let completedCount = 0;
    let failedCount = 0;

    // Execute upload logic for each file
    const uploadPromises = selectedFiles.map(async (item) => {
      const miniStatus = document.getElementById(`mini-status-${item.id}`);
      const miniPercent = document.getElementById(`mini-percent-${item.id}`);
      const miniBar = document.getElementById(`mini-bar-${item.id}`);
      const statusArea = document.getElementById(`status-area-${item.id}`);

      try {
        item.status = 'UPLOADING';
        miniStatus.textContent = 'Requesting presigned URL...';

        // 1. Get presigned URL and insert PENDING record
        const presignResponse = await fetch('/api/images/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: item.file.name,
            fileType: item.file.type,
            fileSize: item.file.size
          })
        });

        const responseData = await presignResponse.json();
        if (!responseData.success) {
          throw new Error(responseData.message || 'Presign generation failed.');
        }

        const { uploadUrl, imageId } = responseData.data;
        item.imageId = imageId;
        miniStatus.textContent = 'Uploading directly to S3...';

        // 2. Perform direct S3 PUT upload
        return new Promise((resolve) => {
          const xhr = new XMLHttpRequest();
          item.xhr = xhr;

          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              item.loaded = e.loaded;
              const percent = Math.round((e.loaded / e.total) * 100);
              item.progress = percent;

              // Update individual card UI
              miniPercent.textContent = `${percent}%`;
              miniBar.style.width = `${percent}%`;

              // Update aggregate progress metrics
              updateAggregateProgress(startTime);
            }
          });

          xhr.addEventListener('load', async () => {
            item.xhr = null;
            if (xhr.status === 200 || xhr.status === 201 || xhr.status === 204) {
              miniStatus.textContent = 'Verifying upload...';
              
              // 3. Confirm upload status
              try {
                const confirmResponse = await fetch('/api/images/confirm', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    imageId: item.imageId,
                    status: 'UPLOADED'
                  })
                });

                const confirmData = await confirmResponse.json();
                if (confirmData.success) {
                  item.status = 'SUCCESS';
                  item.loaded = item.file.size;
                  miniStatus.textContent = 'Uploaded successfully!';
                  miniStatus.className = 'font-semibold text-emerald-600';
                  miniBar.className = 'h-full bg-emerald-500 rounded-full w-full';
                  
                  // Render emerald checkmark badge
                  statusArea.innerHTML = `
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 animate-pulse">
                      <svg class="h-3.5 w-3.5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                      </svg>
                      Success
                    </span>
                  `;
                  
                  completedCount++;
                  resolve(true);
                } else {
                  throw new Error(confirmData.message || 'Confirmation failed.');
                }
              } catch (confirmErr) {
                console.error(`Confirmation failed for ${item.file.name}:`, confirmErr);
                markFileFailed(item, 'Confirmation failed.');
                failedCount++;
                resolve(false);
              }
            } else {
              markFileFailed(item, `S3 error (${xhr.status}).`);
              failedCount++;
              resolve(false);
            }
          });

          xhr.addEventListener('error', () => {
            item.xhr = null;
            markFileFailed(item, 'Network connection lost.');
            failedCount++;
            resolve(false);
          });

          xhr.addEventListener('abort', () => {
            item.xhr = null;
            markFileFailed(item, 'Aborted.');
            failedCount++;
            resolve(false);
          });

          xhr.open('PUT', uploadUrl, true);
          xhr.setRequestHeader('Content-Type', item.file.type);
          xhr.send(item.file);
        });

      } catch (err) {
        console.error(`S3 Upload initiation error for ${item.file.name}:`, err);
        markFileFailed(item, err.message || 'Failed to start.');
        failedCount++;
        return false;
      }
    });

    function markFileFailed(fileItem, errorMsg) {
      fileItem.status = 'FAILED';
      fileItem.loaded = 0;
      
      const mStatus = document.getElementById(`mini-status-${fileItem.id}`);
      const mBar = document.getElementById(`mini-bar-${fileItem.id}`);
      const sArea = document.getElementById(`status-area-${fileItem.id}`);
      
      if (mStatus) {
        mStatus.textContent = errorMsg;
        mStatus.className = 'font-semibold text-rose-600';
      }
      if (mBar) {
        mBar.className = 'h-full bg-rose-500 rounded-full w-full';
      }
      if (sArea) {
        sArea.innerHTML = `
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-100">
            <svg class="h-3.5 w-3.5 text-rose-600" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
            Failed
          </span>
        `;
      }

      // Fire status update to DB
      if (fileItem.imageId) {
        fetch('/api/images/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageId: fileItem.imageId,
            status: 'FAILED'
          })
        }).catch(e => console.error('Failed to update status to FAILED in DB:', e));
      }
    }

    // Wait for all upload life-cycles to complete
    await Promise.all(uploadPromises);

    // Final aggregate complete processing
    progressBar.style.width = '100%';
    progressPercentage.textContent = '100%';
    
    if (failedCount === 0) {
      progressBar.classList.remove('bg-indigo-600');
      progressBar.classList.add('bg-emerald-500');
      progressStatus.textContent = 'All images uploaded successfully!';
      window.Toast.success('Batch Success', `All ${completedCount} images uploaded directly to S3 and stored in database!`);
      
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    } else {
      progressBar.classList.remove('bg-indigo-600');
      progressBar.classList.add('bg-rose-500');
      progressStatus.textContent = `Batch complete with warnings. Succeeded: ${completedCount}, Failed: ${failedCount}`;
      window.Toast.warning('Batch Completed with Warnings', `Uploaded: ${completedCount}, Failed: ${failedCount}. You can check files status.`);
      
      // Unlock cancel button so user can exit
      cancelBtn.removeAttribute('disabled');
      isUploading = false;
    }
  });
});
