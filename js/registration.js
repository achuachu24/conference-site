(function () {
  const form = document.getElementById('registrationForm');

  if (!form) {
    return;
  }

  const paperIdInput = document.getElementById('paperId');
  const firstAuthorNameInput = document.getElementById('firstAuthorName');
  const paymentScreenshotInput = document.getElementById('paymentScreenshot');
  const selectedFileName = document.getElementById('selectedFileName');
  const submitButton = document.getElementById('submitButton');
  const formStatus = document.getElementById('formStatus');
  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  paymentScreenshotInput.addEventListener('change', function () {
    const file = paymentScreenshotInput.files && paymentScreenshotInput.files[0];
    selectedFileName.textContent = file ? file.name : 'No file selected.';
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    const paperId = paperIdInput.value.trim();
    const firstAuthorName = firstAuthorNameInput.value.trim();
    const file = paymentScreenshotInput.files && paymentScreenshotInput.files[0];

    clearStatus();

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

    if (file.size > MAX_FILE_SIZE) {
      showStatus('Payment Screenshot must be smaller than 5 MB.', 'danger');
      paymentScreenshotInput.focus();
      return;
    }

    setSubmitting(true);

    try {
      const base64Data = await toBase64(file);
      const response = await fetch('/api/registrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          paperId,
          firstAuthorName,
          screenshot: {
            fileName: file.name,
            mimeType: file.type,
            base64Data
          }
        })
      });

      const result = await response.json().catch(function () {
        return {};
      });

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed. Please try again.');
      }

      form.reset();
      selectedFileName.textContent = 'No file selected.';
      showStatus(result.message || '\u4e0a\u4f20\u6210\u529f', 'success');
    } catch (error) {
      showStatus(error.message || 'Upload failed. Please try again.', 'danger');
    } finally {
      setSubmitting(false);
    }
  });

  function setSubmitting(isSubmitting) {
    submitButton.disabled = isSubmitting;
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

  function toBase64(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();

      reader.onload = function () {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const parts = result.split(',');
        resolve(parts.length > 1 ? parts[1] : '');
      };

      reader.onerror = function () {
        reject(new Error('Unable to read Payment Screenshot.'));
      };

      reader.readAsDataURL(file);
    });
  }
})();
