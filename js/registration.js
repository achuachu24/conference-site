(function () {
  const form = document.getElementById('registrationForm');
  if (!form) return;

  const paperIdInput = document.getElementById('paperId');
  const firstAuthorNameInput = document.getElementById('firstAuthorName');
  const paymentScreenshotInput = document.getElementById('paymentScreenshot');
  const selectedFileName = document.getElementById('selectedFileName');
  const submitButton = document.getElementById('submitButton');
  const formStatus = document.getElementById('formStatus');
  const honeypotInput = document.getElementById('website');

  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const config = window.USYS_SUPABASE_CONFIG || {};
  const isConfigured = isValidConfig(config);

  let supabaseClient = null;
  if (isConfigured && window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClient = window.supabase.createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
  }

  if (!supabaseClient) {
    submitButton.disabled = true;
    showStatus(
      'Registration storage is not configured yet. Please contact the conference organizer.',
      'warning'
    );
  }

  paymentScreenshotInput.addEventListener('change', function () {
    const file = getSelectedFile();
    selectedFileName.textContent = file ? file.name : 'No file selected.';
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearStatus();

    if (!supabaseClient) {
      showStatus('Registration storage is not configured yet.', 'warning');
      return;
    }

    // Simple bot trap. Real users never see or fill this field.
    if (honeypotInput && honeypotInput.value.trim()) {
      showStatus('上传成功', 'success');
      form.reset();
      selectedFileName.textContent = 'No file selected.';
      return;
    }

    const paperId = paperIdInput.value.trim();
    const firstAuthorName = firstAuthorNameInput.value.trim();
    const file = getSelectedFile();

    if (!paperId) {
      showStatus('Please enter Paper ID.', 'danger');
      paperIdInput.focus();
      return;
    }

    if (!firstAuthorName) {
      showStatus("Please enter First Author's Name.", 'danger');
      firstAuthorNameInput.focus();
      return;
    }

    if (!file) {
      showStatus('Please select Payment Screenshot.', 'danger');
      paymentScreenshotInput.focus();
      return;
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      showStatus('Payment Screenshot must be PNG, JPG, JPEG, or WEBP.', 'danger');
      paymentScreenshotInput.focus();
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      showStatus('Payment Screenshot must be smaller than 5 MB.', 'danger');
      paymentScreenshotInput.focus();
      return;
    }

    setSubmitting(true);

    try {
      const extension = extensionForMime(file.type);
      const safePaperId = sanitizePathPart(paperId) || 'paper';
      const uniquePart = makeUniqueId();
      const storagePath = `submissions/${safePaperId}/${Date.now()}-${uniquePart}.${extension}`;

      const uploadResult = await supabaseClient.storage
        .from(config.bucket || 'payment-proofs')
        .upload(storagePath, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: false
        });

      if (uploadResult.error) {
        throw new Error('Payment screenshot upload failed: ' + uploadResult.error.message);
      }

      const insertResult = await supabaseClient
        .from('registrations')
        .insert({
          paper_id: paperId,
          first_author_name: firstAuthorName,
          payment_path: storagePath,
          payment_file_name: file.name,
          payment_mime_type: file.type,
          payment_size: file.size
        });

      if (insertResult.error) {
        throw new Error('Registration record save failed: ' + insertResult.error.message);
      }

      form.reset();
      selectedFileName.textContent = 'No file selected.';
      showStatus('上传成功 / Registration submitted successfully.', 'success');
    } catch (error) {
      console.error(error);
      showStatus(error.message || 'Upload failed. Please try again.', 'danger');
    } finally {
      setSubmitting(false);
    }
  });

  function getSelectedFile() {
    return paymentScreenshotInput.files && paymentScreenshotInput.files[0]
      ? paymentScreenshotInput.files[0]
      : null;
  }

  function setSubmitting(isSubmitting) {
    submitButton.disabled = isSubmitting || !supabaseClient;
    submitButton.textContent = isSubmitting ? 'Uploading...' : 'Confirm / 确定';
  }

  function clearStatus() {
    formStatus.className = 'registration-status';
    formStatus.textContent = '';
  }

  function showStatus(message, tone) {
    formStatus.className = 'registration-status alert alert-' + tone + ' is-visible';
    formStatus.textContent = message;
  }

  function extensionForMime(mimeType) {
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/webp') return 'webp';
    return 'jpg';
  }

  function sanitizePathPart(value) {
    return String(value)
      .normalize('NFKC')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function makeUniqueId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }

    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function isValidConfig(candidate) {
    return Boolean(
      candidate &&
      typeof candidate.url === 'string' &&
      /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(candidate.url) &&
      typeof candidate.publishableKey === 'string' &&
      candidate.publishableKey.startsWith('sb_publishable_') &&
      !candidate.publishableKey.includes('REPLACE_ME')
    );
  }
})();
