import { getDb } from './mongodb';
import { v4 as uuidv4 } from 'uuid';

// Get or create user from OAuth profile
export async function getOrCreateOAuthUser(profile, provider) {
  const db = await getDb();
  const users = db.collection('users');

  // Check if user exists by email
  let user = await users.findOne({ email: profile.email });

  if (user) {
    // Update OAuth fields if not set
    const updates = { updatedAt: new Date().toISOString() };
    if (provider === 'google' && !user.googleId) {
      updates.googleId = profile.sub || profile.id;
    }
    if (profile.image && !user.avatar) {
      updates.avatar = profile.image;
    }
    if (profile.name && !user.name) {
      updates.name = profile.name;
    }
    await users.updateOne({ _id: user._id }, { $set: updates });
    user = await users.findOne({ _id: user._id });
    return user;
  }

  // Check if this is the first user (becomes master_admin)
  const userCount = await users.countDocuments();
  const role = userCount === 0 ? 'master_admin' : 'employee';

  // Create new user
  const newUser = {
    _id: uuidv4(),
    email: profile.email,
    name: profile.name || profile.email.split('@')[0],
    avatar: profile.image || '',
    role,
    googleId: provider === 'google' ? (profile.sub || profile.id) : null,
    passwordHash: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await users.insertOne(newUser);
  return newUser;
}

// Get Google OAuth credentials from DB
export async function getGoogleCredentials() {
  const db = await getDb();
  const integrations = await db.collection('integrations').findOne({});
  if (!integrations?.google) return null;
  const { clientId, clientSecret } = integrations.google;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

// Role hierarchy check
export function hasPermission(userRole, requiredRole) {
  const hierarchy = { master_admin: 3, admin: 2, employee: 1 };
  return (hierarchy[userRole] || 0) >= (hierarchy[requiredRole] || 0);
}

// Get visible nav items based on role
export function getVisibleNavItems(role) {
  const allItems = [
    'dashboard', 'orders', 'products', 'inventory',
    'employees', 'expenses', 'reports', 'integrations', 'settings'
  ];

  switch (role) {
    case 'master_admin':
      return allItems;
    case 'admin':
      return allItems.filter(i => !['settings', 'integrations'].includes(i));
    case 'employee':
      return ['dashboard'];
    default:
      return ['dashboard'];
  }
}
