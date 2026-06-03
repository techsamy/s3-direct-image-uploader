const linkedinService = require('../services/linkedinService');

async function redirectToLinkedIn(req, res) {
  try {
    const authUrl = linkedinService.getAuthUrl();
    res.redirect(authUrl);
  } catch (error) {
    console.error('[AuthController] Failed to build redirect URL:', error.message);
    res.status(500).send(`
      <div style="font-family: sans-serif; padding: 2rem; max-width: 500px; margin: auto; text-align: center;">
        <h2 style="color: #ef4444;">OAuth Configuration Error</h2>
        <p>${error.message}</p>
        <p style="color: #6b7280; font-size: 0.875rem;">Check your environment variables for LinkedIn client details.</p>
      </div>
    `);
  }
}

async function handleCallback(req, res) {
  const { code, error, error_description } = req.query;

  if (error) {
    console.error('[AuthController] Callback returned error:', error, error_description);
    return res.status(400).send(`
      <div style="font-family: sans-serif; padding: 2rem; max-width: 500px; margin: auto; text-align: center;">
        <h2 style="color: #ef4444;">LinkedIn Authorization Denied</h2>
        <p>${error_description || error}</p>
        <a href="/upload.html" style="display: inline-block; margin-top: 1rem; padding: 0.5rem 1rem; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 0.375rem;">Return to CloudSnap</a>
      </div>
    `);
  }

  if (!code) {
    return res.status(400).send('[AuthController] Missing authorization code.');
  }

  try {
    await linkedinService.exchangeCodeForTokens(code);
    
    // Send a beautifully styled success page that auto-closes or links back
    res.send(`
      <div style="font-family: sans-serif; padding: 3rem 2rem; max-width: 500px; margin: 100px auto; text-align: center; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e5e7eb; background: white;">
        <div style="font-size: 4rem; margin-bottom: 1rem;">🎉</div>
        <h2 style="color: #10b981; margin-bottom: 0.5rem; font-size: 1.5rem;">LinkedIn Setup Successful!</h2>
        <p style="color: #4b5563; line-height: 1.5; margin-bottom: 2rem;">CloudSnap has been securely authorized to publish posts to your LinkedIn Company Page. The access token rotation is now active.</p>
        <a href="/" style="display: inline-block; padding: 0.75rem 1.5rem; background-color: #0077b5; color: white; font-weight: 600; text-decoration: none; border-radius: 0.5rem; transition: background 0.2s;">Go to Dashboard</a>
      </div>
    `);
  } catch (err) {
    console.error('[AuthController] Token exchange error:', err.message);
    res.status(500).send(`
      <div style="font-family: sans-serif; padding: 2rem; max-width: 500px; margin: auto; text-align: center;">
        <h2 style="color: #ef4444;">Token Exchange Failed</h2>
        <p>${err.message}</p>
        <a href="/" style="display: inline-block; margin-top: 1rem; padding: 0.5rem 1rem; background-color: #ef4444; color: white; text-decoration: none; border-radius: 0.375rem;">Return to Dashboard</a>
      </div>
    `);
  }
}

module.exports = {
  redirectToLinkedIn,
  handleCallback
};
