/**
 * Frontend LinkedIn Posts Automation Controller
 * Handles tab navigation, compose form submission, local file to S3 uploads, 
 * loading skeletons, and webhook dispatch actions.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Tab elements
  const tabGallery = document.getElementById('tab-gallery');
  const tabPosts = document.getElementById('tab-posts');
  const sectionGallery = document.getElementById('section-gallery');
  const sectionPosts = document.getElementById('section-posts');

  // Modal & Form Elements
  const btnCompose = document.getElementById('btn-compose');
  const composeModal = document.getElementById('compose-modal');
  const closeComposeBtn = document.getElementById('close-compose-btn');
  const composeCancelBtn = document.getElementById('compose-cancel-btn');
  const composeForm = document.getElementById('compose-form');
  const composeType = document.getElementById('compose-type');
  const composeTitle = document.getElementById('compose-title');
  const composeLinkContainer = document.getElementById('compose-link-container');
  const composeLink = document.getElementById('compose-link');
  const composeContent = document.getElementById('compose-content');

  // Form Image elements
  const composeImageInput = document.getElementById('compose-image-input');
  const composeImageFilename = document.getElementById('compose-image-filename');
  const composeImageRemove = document.getElementById('compose-image-remove');
  const composeImagePreviewContainer = document.getElementById('compose-image-preview-container');
  const composeImagePreview = document.getElementById('compose-image-preview');

  // Submit Buttons
  const composeSubmitBtn = document.getElementById('compose-submit-btn');
  const composeSubmitLabel = document.getElementById('compose-submit-label');
  const composeSubmitSpinner = document.getElementById('compose-submit-spinner');

  // Lists & State
  const postsSkeleton = document.getElementById('posts-skeleton');
  const postsEmpty = document.getElementById('posts-empty');
  const postsTableContainer = document.getElementById('posts-table-container');
  const postsTbody = document.getElementById('posts-tbody');

  let selectedImageFile = null;

  // 1. Tab switching listeners
  tabGallery.addEventListener('click', () => {
    // Set Active Gallery tab styling
    tabGallery.className = "pb-3 text-sm font-bold text-indigo-600 border-b-2 border-indigo-600 transition-all focus:outline-none";
    tabPosts.className = "pb-3 text-sm font-bold text-slate-400 hover:text-slate-600 border-b-2 border-transparent transition-all focus:outline-none flex items-center gap-1.5";
    
    sectionGallery.classList.remove('hidden');
    sectionPosts.classList.add('hidden');
  });

  tabPosts.addEventListener('click', () => {
    // Set Active Posts tab styling
    tabPosts.className = "pb-3 text-sm font-bold text-indigo-600 border-b-2 border-indigo-600 transition-all focus:outline-none flex items-center gap-1.5";
    tabGallery.className = "pb-3 text-sm font-bold text-slate-400 hover:text-slate-600 border-b-2 border-transparent transition-all focus:outline-none";
    
    sectionPosts.classList.remove('hidden');
    sectionGallery.classList.add('hidden');
    
    fetchPosts();
  });

  // 2. Compose Modal Show/Hide
  btnCompose.addEventListener('click', () => {
    composeModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  });

  function closeComposeModal() {
    composeModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    resetComposeForm();
  }

  closeComposeBtn.addEventListener('click', closeComposeModal);
  composeCancelBtn.addEventListener('click', closeComposeModal);

  // Close modal when clicking outside background blur
  composeModal.addEventListener('click', (e) => {
    if (e.target === composeModal) {
      closeComposeModal();
    }
  });

  // 3. Post Type change listener (toggles URL input visibility)
  composeType.addEventListener('change', () => {
    if (composeType.value === 'ARTICLE_LINK') {
      composeLinkContainer.classList.remove('hidden');
      composeLink.required = true;
    } else {
      composeLinkContainer.classList.add('hidden');
      composeLink.required = false;
      composeLink.value = '';
    }
  });

  // 4. File picker selection details & previews
  composeImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    selectedImageFile = file;
    composeImageFilename.textContent = file.name;
    composeImageFilename.classList.remove('text-slate-400');
    composeImageFilename.classList.add('text-slate-700', 'font-semibold');
    composeImageRemove.classList.remove('hidden');

    // Create a local object URL to display preview
    const objectUrl = URL.createObjectURL(file);
    composeImagePreview.src = objectUrl;
    composeImagePreviewContainer.classList.remove('hidden');
  });

  // Clear Image Selection
  composeImageRemove.addEventListener('click', () => {
    clearImageSelection();
  });

  function clearImageSelection() {
    composeImageInput.value = '';
    selectedImageFile = null;
    composeImageFilename.textContent = 'No file selected';
    composeImageFilename.classList.remove('text-slate-700', 'font-semibold');
    composeImageFilename.classList.add('text-slate-400');
    composeImageRemove.classList.add('hidden');
    composeImagePreviewContainer.classList.add('hidden');
    if (composeImagePreview.src.startsWith('blob:')) {
      URL.revokeObjectURL(composeImagePreview.src);
    }
    composeImagePreview.src = '';
  }

  function resetComposeForm() {
    composeForm.reset();
    clearImageSelection();
    composeLinkContainer.classList.add('hidden');
    composeLink.required = false;
    
    // Reset buttons
    setSubmitLoading(false);
  }

  // Set submit loading button state
  function setSubmitLoading(isLoading) {
    if (isLoading) {
      composeSubmitBtn.disabled = true;
      composeSubmitLabel.textContent = 'Uploading & Saving...';
      composeSubmitSpinner.classList.remove('hidden');
    } else {
      composeSubmitBtn.disabled = false;
      composeSubmitLabel.textContent = 'Save Draft';
      composeSubmitSpinner.classList.add('hidden');
    }
  }

  // 5. Submit Form to Node Backend
  composeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setSubmitLoading(true);

    try {
      let imageId = null;

      // Check if image upload is required first
      if (selectedImageFile) {
        imageId = await uploadImageToS3(selectedImageFile);
      }

      // Prepare save draft payload
      const payload = {
        title: composeTitle.value.trim() || null,
        content: composeContent.value.trim(),
        post_type: composeType.value,
        external_url: composeType.value === 'ARTICLE_LINK' ? composeLink.value.trim() : null,
        image_id: imageId
      };

      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save draft.');
      }

      window.Toast.success('Draft Saved', 'Your LinkedIn post draft has been created.');
      closeComposeModal();
      fetchPosts();

    } catch (err) {
      console.error('[ComposeForm] Error saving draft:', err);
      window.Toast.error('Save Failed', err.message || 'An error occurred while uploading cover photo or saving draft.');
      setSubmitLoading(false);
    }
  });

  /**
   * Helper function to sign upload parameters, PUT upload directly to S3 bucket,
   * and confirm image registration returning the image_id.
   */
  async function uploadImageToS3(file) {
    console.log('[S3Upload] Fetching presigned upload URL...');
    const presignResponse = await fetch('/api/images/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      })
    });

    const presignData = await presignResponse.json();
    if (!presignResponse.ok || !presignData.success) {
      throw new Error(presignData.message || 'S3 authorization failed.');
    }

    const { uploadUrl, imageId } = presignData.data;

    console.log('[S3Upload] Dispatching binary upload PUT to S3...');
    const s3PutResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type
      },
      body: file
    });

    if (!s3PutResponse.ok) {
      throw new Error('Failed to upload image file to AWS S3 bucket.');
    }

    console.log('[S3Upload] Confirming upload registration...');
    const confirmResponse = await fetch('/api/images/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageId: imageId,
        status: 'UPLOADED'
      })
    });

    const confirmData = await confirmResponse.json();
    if (!confirmResponse.ok || !confirmData.success) {
      throw new Error(confirmData.message || 'Failed to register S3 image.');
    }

    return confirmData.data.id; // Return DB image table ID
  }

  // 6. Fetch LinkedIn Posts lists
  async function fetchPosts() {
    postsSkeleton.classList.remove('hidden');
    postsEmpty.classList.add('hidden');
    postsTableContainer.classList.add('hidden');

    try {
      const response = await fetch('/api/posts');
      const posts = await response.json();

      postsSkeleton.classList.add('hidden');

      if (!posts || posts.length === 0) {
        postsEmpty.classList.remove('hidden');
        return;
      }

      renderPostsRows(posts);
      postsTableContainer.classList.remove('hidden');

    } catch (error) {
      console.error('[FetchPosts] Error sync posts:', error);
      postsSkeleton.classList.add('hidden');
      postsEmpty.classList.remove('hidden');
      window.Toast.error('Load Failed', 'Failed to retrieve posts from server.');
    }
  }

  // Draw posts rows programmatically
  function renderPostsRows(posts) {
    postsTbody.innerHTML = '';

    posts.forEach((post) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50/50 transition-colors duration-150';

      // Post Type Badge
      const typeBadge = post.post_type === 'ARTICLE_LINK' 
        ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">Article Share</span>`
        : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">Feed Post</span>`;

      // Status badge
      let statusBadge = '';
      if (post.status === 'PUBLISHED') {
        statusBadge = `
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
            Published
          </span>
        `;
      } else if (post.status === 'PENDING_N8N') {
        statusBadge = `
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100">
            <svg class="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Sending...
          </span>
        `;
      } else if (post.status === 'FAILED') {
        statusBadge = `
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-100 cursor-help" title="${post.error_message || 'n8n execution failed'}">
            Failed ⚠️
          </span>
        `;
      } else {
        statusBadge = `
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            Draft
          </span>
        `;
      }

      // Thumbnail view logic
      let previewContent = '-';
      if (post.image_url) {
        previewContent = `
          <div class="h-10 w-10 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shadow-sm">
            <img src="${post.image_url}" alt="Thumbnail" class="h-full w-full object-cover">
          </div>
        `;
      }

      // Title & Content display
      const titleText = post.title ? `<h4 class="font-bold text-slate-800 text-xs">${post.title}</h4>` : '';
      const bodyText = `<p class="text-xs text-slate-500 line-clamp-2 mt-0.5" title="${post.content}">${post.content}</p>`;
      const linkText = post.external_url 
        ? `<a href="${post.external_url}" target="_blank" class="text-[10px] text-blue-500 hover:underline block truncate max-w-xs mt-1 font-semibold">${post.external_url}</a>`
        : '';

      // Action Buttons
      let actionButtons = '';
      if (post.status === 'DRAFT' || post.status === 'FAILED') {
        actionButtons = `
          <button class="btn-send-n8n px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-[11px] font-bold text-white rounded-lg shadow-sm transition-all" data-id="${post.id}">
            Publish / Send
          </button>
        `;
      } else if (post.status === 'PUBLISHED') {
        // LinkedIn doesn't always have a direct link format if URN isn't decoded, 
        // but we can offer a general feed link or open page admin dashboard link 
        const link = `https://www.linkedin.com/feed/`;
        actionButtons = `
          <a href="${link}" target="_blank" class="inline-block px-3 py-1.5 border border-slate-200 text-slate-600 hover:text-[#0077b5] hover:bg-slate-50 text-[11px] font-bold rounded-lg transition-all">
            View Live
          </a>
        `;
      } else {
        actionButtons = `
          <button disabled class="px-3 py-1.5 bg-slate-100 text-slate-400 text-[11px] font-bold rounded-lg cursor-not-allowed">
            Locked
          </button>
        `;
      }

      tr.innerHTML = `
        <td class="py-4 px-6 font-bold text-slate-400/80">${post.id}</td>
        <td class="py-4 px-6">${typeBadge}</td>
        <td class="py-4 px-6 max-w-sm">
          ${titleText}
          ${bodyText}
          ${linkText}
        </td>
        <td class="py-3 px-6">${previewContent}</td>
        <td class="py-4 px-6">${statusBadge}</td>
        <td class="py-4 px-6 text-xs text-slate-400 font-semibold">${formatDate(post.created_at)}</td>
        <td class="py-4 px-6 text-right">${actionButtons}</td>
      `;

      postsTbody.appendChild(tr);
    });

    // Add click listeners to Send / Publish buttons
    document.querySelectorAll('.btn-send-n8n').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        e.currentTarget.disabled = true;
        e.currentTarget.textContent = 'Sending...';
        await sendPostToLinkedIn(id);
      });
    });
  }

  // 7. Fire publish command to backend API
  async function sendPostToLinkedIn(id) {
    try {
      const response = await fetch(`/api/posts/${id}/send`, {
        method: 'POST'
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to publish post.');
      }

      window.Toast.success('Post Published', 'Your post has been successfully shared on LinkedIn!');
      fetchPosts();

    } catch (err) {
      console.error('[SendPost] Error:', err);
      window.Toast.error('Publish Failed', err.message);
      fetchPosts();
    }
  }

  // Helper date formatter matching main dashboard
  function formatDate(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }) + ' ' + date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
});
