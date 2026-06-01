/**
 * Frontend Image List Management Board
 * Implements listing, search, pagination, shimmer states, and detailed preview overlays.
 */
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  const limitSelect = document.getElementById('limit-select');
  const totalCountLabel = document.getElementById('total-count-label');
  
  const skeletonLoading = document.getElementById('skeleton-loading');
  const emptyState = document.getElementById('empty-state');
  const emptyTitle = document.getElementById('empty-title');
  const emptyDesc = document.getElementById('empty-desc');
  const emptyBtn = document.getElementById('empty-btn');
  const tableContainer = document.getElementById('table-container');
  const imagesTbody = document.getElementById('images-tbody');

  const paginationContainer = document.getElementById('pagination-container');
  const paginationInfo = document.getElementById('pagination-info');
  const prevPageBtn = document.getElementById('prev-page-btn');
  const nextPageBtn = document.getElementById('next-page-btn');
  const pagesList = document.getElementById('pages-list');

  // Modal elements
  const previewModal = document.getElementById('preview-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const modalImage = document.getElementById('modal-image');
  const modalTitle = document.getElementById('modal-title');
  const modalKey = document.getElementById('modal-key');
  const modalSize = document.getElementById('modal-size');
  const modalDownloadLink = document.getElementById('modal-download-link');

  // State Management
  let currentPage = 1;
  let itemsLimit = 10;
  let searchQuery = '';
  let debounceTimer = null;

  // Format bytes to human readable format
  function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Format DB timestamp to readable date/time
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

  // Fetch data from local Express APIs
  async function fetchImages() {
    // 1. Show loading state, hide content
    skeletonLoading.classList.remove('hidden');
    emptyState.classList.add('hidden');
    tableContainer.classList.add('hidden');
    paginationContainer.classList.add('hidden');

    try {
      const url = `/api/images?page=${currentPage}&limit=${itemsLimit}&search=${encodeURIComponent(searchQuery)}`;
      const response = await fetch(url);
      const payload = await response.json();

      if (!payload.success) {
        throw new Error(payload.message || 'API request failed.');
      }

      const images = payload.data || [];
      const { total, page, limit, totalPages } = payload.pagination;

      // 2. Hide loading skeletons
      skeletonLoading.classList.add('hidden');

      // Update counters
      totalCountLabel.textContent = `Total: ${total} ${total === 1 ? 'image' : 'images'}`;

      if (images.length === 0) {
        // 3. Trigger custom empty states depending on search values
        emptyState.classList.remove('hidden');
        if (searchQuery) {
          emptyTitle.textContent = 'No Search Results';
          emptyDesc.textContent = `No images match your search term "${searchQuery}". Try clearing the search or refine it.`;
          emptyBtn.textContent = 'Clear Search';
          emptyBtn.href = '#';
          emptyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            searchInput.value = '';
            searchQuery = '';
            currentPage = 1;
            fetchImages();
          }, { once: true });
        } else {
          emptyTitle.textContent = 'No Images Uploaded';
          emptyDesc.textContent = 'No images have been uploaded yet. Click on the button below to upload your first cloud image.';
          emptyBtn.textContent = 'Upload Your First Image';
          emptyBtn.href = '/upload.html';
        }
        return;
      }

      // 4. Populate table rows
      renderTableRows(images, (currentPage - 1) * itemsLimit + 1);
      tableContainer.classList.remove('hidden');

      // 5. Update Pagination Metadata
      renderPagination(total, page, limit, totalPages);
      paginationContainer.classList.remove('hidden');

    } catch (error) {
      console.error('Fetch Error:', error);
      skeletonLoading.classList.add('hidden');
      emptyState.classList.remove('hidden');
      emptyTitle.textContent = 'Connection Error';
      emptyDesc.textContent = 'Failed to load cloud images. Please check if your MySQL server and Node backend are running.';
      emptyBtn.textContent = 'Retry Connection';
      emptyBtn.href = '#';
      emptyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fetchImages();
      }, { once: true });

      window.Toast.error('Load Failed', 'Could not sync records from database.');
    }
  }

  // Draw table rows programmatically
  function renderTableRows(images, startSNo) {
    imagesTbody.innerHTML = '';
    
    images.forEach((img, idx) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50/50 transition-colors duration-150';
      
      const sNo = startSNo + idx;
      
      // Compute status badge
      let statusBadge = '';
      if (img.status === 'UPLOADED') {
        statusBadge = `
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
            <svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            Uploaded
          </span>
        `;
      } else if (img.status === 'PENDING') {
        statusBadge = `
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100">
            <svg class="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Pending
          </span>
        `;
      } else {
        statusBadge = `
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-100">
            <svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
            Failed
          </span>
        `;
      }

      // Thumbnail view logic
      let previewContent = '';
      if (img.status === 'UPLOADED' && img.image_url) {
        previewContent = `
          <div class="h-11 w-11 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shadow-sm cursor-zoom-in hover:scale-105 transition-all duration-200 thumbnail-trigger" data-url="${img.image_url}" data-name="${img.file_name}" data-key="${img.s3_key}" data-size="${img.file_size}">
            <img src="${img.image_url}" alt="${img.file_name}" class="h-full w-full object-cover">
          </div>
        `;
      } else {
        previewContent = `
          <div class="h-11 w-11 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </div>
        `;
      }

      // S3 Link/Key rendering
      let s3LinkContent = '';
      if (img.status === 'UPLOADED' && img.image_url) {
        s3LinkContent = `
          <a href="${img.image_url}" target="_blank" class="font-semibold text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1 truncate max-w-[260px] sm:max-w-[340px]" title="Open direct S3 link">
            ${img.s3_key}
            <svg class="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        `;
      } else {
        s3LinkContent = `<span class="text-slate-400 font-mono text-xs truncate max-w-[260px] inline-block" title="${img.s3_key}">${img.s3_key}</span>`;
      }

      tr.innerHTML = `
        <td class="py-4 px-6 font-bold text-slate-400/80">${sNo}</td>
        <td class="py-3 px-6">${previewContent}</td>
        <td class="py-4 px-6 font-semibold text-slate-800 break-all select-all">${img.file_name}</td>
        <td class="py-4 px-6 font-mono text-xs">${s3LinkContent}</td>
        <td class="py-4 px-6">${statusBadge}</td>
        <td class="py-4 px-6 font-semibold text-slate-500">${formatBytes(img.file_size)}</td>
        <td class="py-4 px-6 text-xs text-slate-400 font-semibold">${formatDate(img.created_at)}</td>
      `;

      imagesTbody.appendChild(tr);
    });

    // Add listeners to thumbnails
    document.querySelectorAll('.thumbnail-trigger').forEach(el => {
      el.addEventListener('click', (e) => {
        const item = e.currentTarget;
        openModal(
          item.getAttribute('data-url'),
          item.getAttribute('data-name'),
          item.getAttribute('data-key'),
          parseInt(item.getAttribute('data-size'))
        );
      });
    });
  }

  // Draw pagination buttons dynamically
  function renderPagination(total, page, limit, totalPages) {
    const startNum = (page - 1) * limit + 1;
    const endNum = Math.min(page * limit, total);
    paginationInfo.textContent = `Showing ${startNum} to ${endNum} of ${total} entries`;

    // Disable state for previous/next buttons
    prevPageBtn.disabled = page === 1;
    nextPageBtn.disabled = page === totalPages || totalPages === 0;

    pagesList.innerHTML = '';

    // Max visible page buttons: 5
    const maxVisible = 5;
    let startPage = Math.max(1, page - 2);
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      const btn = document.createElement('button');
      btn.textContent = i;
      if (i === page) {
        btn.className = 'px-3.5 py-1.5 text-xs font-bold bg-indigo-600 border border-indigo-600 text-white rounded-lg transition-all shadow-sm';
      } else {
        btn.className = 'px-3.5 py-1.5 text-xs font-semibold bg-white border border-slate-200 hover:border-slate-300 text-slate-600 hover:bg-slate-50 rounded-lg transition-all';
      }
      
      btn.addEventListener('click', () => {
        currentPage = i;
        fetchImages();
      });
      pagesList.appendChild(btn);
    }
  }

  // Pre-load large modal details
  function openModal(url, name, key, size) {
    modalImage.src = url;
    modalTitle.textContent = name;
    modalKey.textContent = `S3 Key: ${key}`;
    modalSize.textContent = formatBytes(size);
    modalDownloadLink.href = url;
    
    previewModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  function closeModal() {
    previewModal.classList.add('hidden');
    modalImage.src = '';
    document.body.classList.remove('overflow-hidden');
  }

  // Wire search bar input with debouncing to reduce DB stress
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    searchQuery = e.target.value.trim();
    debounceTimer = setTimeout(() => {
      currentPage = 1;
      fetchImages();
    }, 450);
  });

  // Limit Selector Listener
  limitSelect.addEventListener('change', (e) => {
    itemsLimit = parseInt(e.target.value);
    currentPage = 1;
    fetchImages();
  });

  // Prev/Next handlers
  prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      fetchImages();
    }
  });

  nextPageBtn.addEventListener('click', () => {
    currentPage++;
    fetchImages();
  });

  // Modal triggers
  closeModalBtn.addEventListener('click', closeModal);
  previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !previewModal.classList.contains('hidden')) {
      closeModal();
    }
  });

  // Initial Sync
  fetchImages();
});
