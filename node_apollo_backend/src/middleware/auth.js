const jwt = require('jsonwebtoken');

/**
 * Extract and verify the JWT token.
 * @param {string} token - The raw token string (possibly with 'Bearer ' prefix).
 * @returns {Object|null} - The decoded user object if valid, otherwise null.
 */
const getUserFromToken = (token) => {
  if (!token) return null;

  try {
    // Remove 'Bearer ' prefix if present
    if (token.startsWith('Bearer ')) {
      token = token.slice(7, token.length).trim();
    }

    if (!token) return null;

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.warn('JWT_SECRET is not defined in environment variables.');
      return null;
    }

    const decoded = jwt.verify(token, secret);

    // Normalize and return user info
    // Expecting payload to contain { id (or _id), companyId, role }
    return {
      id: decoded.id || decoded._id,
      companyId: decoded.companyId,
      role: decoded.role,
      email: decoded.email
    };
  } catch (err) {
    // Token is invalid or expired
    return null;
  }
};

module.exports = {
  getUserFromToken
};
