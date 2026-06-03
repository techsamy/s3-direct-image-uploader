const db = require('../config/db');

class LinkedInService {
  /**
   * Generates the LinkedIn OAuth consent screen redirect URL.
   */
  getAuthUrl() {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI;
    
    if (!clientId || !redirectUri) {
      throw new Error('[LinkedInService] Missing LINKEDIN_CLIENT_ID or LINKEDIN_REDIRECT_URI in env.');
    }

    // Scopes needed for posting on LinkedIn. Space-separated or comma-separated in env.
    const scopesList = (process.env.LINKEDIN_SCOPES || 'w_member_social')
      .replace(/,/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const scope = encodeURIComponent(scopesList);
    
    return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=cloudsnap_auth_state`;
  }

  /**
   * Exchanges the OAuth authorization code for initial access & refresh token pairs.
   */
  async exchangeCodeForTokens(code) {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret
    });

    console.log('[LinkedInService] Exchanging authorization code for tokens...');
    
    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: bodyParams.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[LinkedInService] Failed to exchange code: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // access_token expires in usually 60 days (5184000 seconds)
    // refresh_token expires in usually 365 days (31536000 seconds)
    const expiresIn = data.expires_in || 5184000;
    const refreshTokenExpiresIn = data.refresh_token_expires_in || 31536000;

    await this.saveTokens(
      data.access_token,
      expiresIn,
      data.refresh_token,
      refreshTokenExpiresIn
    );

    return data;
  }

  /**
   * Refreshes the access token using the stored refresh token.
   */
  async refreshAccessToken(storedRefreshToken) {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

    const bodyParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: storedRefreshToken,
      client_id: clientId,
      client_secret: clientSecret
    });

    console.log('[LinkedInService] Rotating/refreshing LinkedIn Access Token...');

    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: bodyParams.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[LinkedInService] Failed to refresh access token: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    const expiresIn = data.expires_in || 5184000;
    const refreshTokenExpiresIn = data.refresh_token_expires_in || 31536000;

    // Save the new pair back to database
    await this.saveTokens(
      data.access_token,
      expiresIn,
      data.refresh_token,
      refreshTokenExpiresIn
    );

    return data.access_token;
  }

  /**
   * Fetches the current valid access token, rotating it if it has expired or is expiring soon.
   */
  async getAccessToken() {
    const rows = await db.query('SELECT * FROM linkedin_oauth WHERE id = 1 LIMIT 1');
    if (!rows || rows.length === 0) {
      throw new Error('LINKEDIN_NOT_AUTHORIZED');
    }

    const credentials = rows[0];
    const now = new Date();
    
    // Check if access token is expired or expiring in next 5 minutes
    const tokenExpiry = new Date(credentials.access_token_expires_at);
    const timeRemaining = tokenExpiry.getTime() - now.getTime();
    
    if (timeRemaining > 5 * 60 * 1000) {
      // Access token is still valid
      return credentials.access_token;
    }

    // Access token is close to expiry; check if refresh token exists
    if (!credentials.refresh_token || !credentials.refresh_token_expires_at) {
      throw new Error('LINKEDIN_ACCESS_TOKEN_EXPIRED');
    }

    const refreshExpiry = new Date(credentials.refresh_token_expires_at);
    if (refreshExpiry.getTime() <= now.getTime()) {
      throw new Error('LINKEDIN_REFRESH_TOKEN_EXPIRED');
    }

    // Refresh the access token programmatically
    return await this.refreshAccessToken(credentials.refresh_token);
  }

  /**
   * Helper to persist tokens to database
   */
  async saveTokens(accessToken, expiresInSeconds, refreshToken, refreshTokenExpiresInSeconds) {
    const now = new Date();
    const accessTokenExpiry = new Date(now.getTime() + (expiresInSeconds * 1000));
    
    const refreshTokenExpiry = refreshTokenExpiresInSeconds
      ? new Date(now.getTime() + (refreshTokenExpiresInSeconds * 1000))
      : null;

    // Upsert query using REPLACE (since table has a primary key of id = 1)
    const sql = `
      REPLACE INTO linkedin_oauth (
        id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at
      ) VALUES (1, ?, ?, ?, ?)
    `;

    await db.query(sql, [
      accessToken,
      refreshToken || null,
      accessTokenExpiry,
      refreshTokenExpiry
    ]);
    
    console.log('[LinkedInService] Tokens successfully stored in DB.');
  }

  /**
   * Fetches the member profile URN using Userinfo or Me endpoint
   */
  async getMemberUrn() {
    const accessToken = await this.getAccessToken();
    
    // First attempt: /v2/userinfo (OpenID Connect userinfo)
    try {
      const response = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      if (response.ok) {
        const userInfo = await response.json();
        if (userInfo && userInfo.sub) {
          return `urn:li:person:${userInfo.sub}`;
        }
      }
    } catch (err) {
      console.warn('[LinkedInService] Failed to fetch /v2/userinfo:', err.message);
    }

    // Second attempt: /v2/me (Classic Profile)
    const response = await fetch('https://api.linkedin.com/v2/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`[LinkedInService] Failed to retrieve member profile: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    if (!data || !data.id) {
      throw new Error('[LinkedInService] Member profile response did not contain an id.');
    }

    return `urn:li:person:${data.id}`;
  }

  /**
   * Downloads media from S3 public URL and uploads it to LinkedIn, returning digitalmediaAsset URN
   */
  async uploadMedia(memberUrn, imageUrl) {
    const accessToken = await this.getAccessToken();

    // 1. Download the image from S3 public URL
    console.log(`[LinkedInService] Fetching image from S3 URL: ${imageUrl}`);
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) {
      throw new Error(`Failed to download image from S3: ${imgResponse.statusText}`);
    }
    const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
    const imageBuffer = Buffer.from(await imgResponse.arrayBuffer());

    // 2. Register upload on LinkedIn
    console.log('[LinkedInService] Registering media upload with LinkedIn...');
    const registerResponse = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: memberUrn,
          serviceRelationships: [{
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent'
          }]
        }
      })
    });

    if (!registerResponse.ok) {
      const errText = await registerResponse.text();
      throw new Error(`Failed to register upload with LinkedIn: ${registerResponse.status} - ${errText}`);
    }

    const registerData = await registerResponse.json();
    const uploadMechanism = registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'];
    const uploadUrl = uploadMechanism.uploadUrl;
    const mediaUrn = registerData.value.asset;

    // 3. Upload image binary
    console.log('[LinkedInService] Uploading image binary to LinkedIn...');
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': contentType
      },
      body: imageBuffer
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(`Failed to upload image binary to LinkedIn: ${uploadResponse.status} - ${errText}`);
    }

    console.log(`[LinkedInService] Image uploaded successfully. Media URN: ${mediaUrn}`);
    return mediaUrn;
  }

  /**
   * Publishes a post directly to LinkedIn
   */
  async publishPost(post) {
    const accessToken = await this.getAccessToken();
    
    // Determine the author/owner URN (supports Organization or fallback to authenticated member)
    let authorUrn = process.env.LINKEDIN_ORGANIZATION_URN;
    if (authorUrn) {
      authorUrn = authorUrn.trim();
      if (!authorUrn.startsWith('urn:li:')) {
        authorUrn = `urn:li:organization:${authorUrn}`;
      }
    } else {
      authorUrn = await this.getMemberUrn();
    }

    console.log(`[LinkedInService] Publishing post on behalf of author: ${authorUrn}`);

    let mediaUrn = null;
    if (post.s3_image_url) {
      try {
        mediaUrn = await this.uploadMedia(authorUrn, post.s3_image_url);
      } catch (uploadError) {
        console.error('[LinkedInService] Media upload failed, falling back to text-only post:', uploadError.message);
        throw uploadError;
      }
    }

    // Build standard UGC Post payload
    const payload = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {}
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
      }
    };

    const shareContent = payload.specificContent['com.linkedin.ugc.ShareContent'];
    shareContent.shareCommentary = {
      text: post.content
    };

    if (post.post_type === 'ARTICLE_LINK' && post.external_url) {
      shareContent.shareMediaCategory = 'ARTICLE';
      shareContent.media = [{
        status: 'READY',
        originalUrl: post.external_url,
        title: {
          text: post.title || 'Shared Article'
        }
      }];
      if (post.s3_image_url) {
        shareContent.media[0].thumbnails = [{
          resolvedUrl: post.s3_image_url
        }];
      }
    } else if (mediaUrn) {
      shareContent.shareMediaCategory = 'IMAGE';
      shareContent.media = [{
        status: 'READY',
        media: mediaUrn,
        title: {
          text: post.title || 'Shared Image'
        }
      }];
    } else {
      shareContent.shareMediaCategory = 'NONE';
    }

    console.log('[LinkedInService] Sending ugcPost payload to LinkedIn:', JSON.stringify(payload, null, 2));

    const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LinkedIn API returned error: ${response.status} - ${errText}`);
    }

    const responseData = await response.json();
    console.log('[LinkedInService] UGC Post created successfully:', responseData);
    return responseData.id; // Returns the UGC Post URN (e.g. "urn:li:share:123456789")
  }
}

module.exports = new LinkedInService();
