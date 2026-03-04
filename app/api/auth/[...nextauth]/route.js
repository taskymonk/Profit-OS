import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getDb } from '@/lib/mongodb';
import { getOrCreateOAuthUser } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

const bcrypt = require('bcryptjs');

async function getGoogleCreds() {
  try {
    const db = await getDb();
    const integrations = await db.collection('integrations').findOne({});
    if (integrations?.google?.clientId && integrations?.google?.clientSecret) {
      return {
        clientId: integrations.google.clientId,
        clientSecret: integrations.google.clientSecret,
      };
    }
  } catch (e) {
    console.error('Failed to fetch Google credentials from DB:', e.message);
  }
  // Return dummy values - Google sign-in will just fail gracefully
  return { clientId: 'not-configured', clientSecret: 'not-configured' };
}

const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env._GOOGLE_CLIENT_ID || 'placeholder',
      clientSecret: process.env._GOOGLE_CLIENT_SECRET || 'placeholder',
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    }),
    CredentialsProvider({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        action: { label: 'Action', type: 'text' },
        name: { label: 'Name', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        const db = await getDb();
        const users = db.collection('users');
        const email = credentials.email.toLowerCase().trim();

        if (credentials.action === 'register') {
          // Registration flow
          const existing = await users.findOne({ email });
          if (existing) {
            throw new Error('An account with this email already exists. Please sign in.');
          }

          if (!credentials.password || credentials.password.length < 6) {
            throw new Error('Password must be at least 6 characters');
          }

          const userCount = await users.countDocuments();
          const role = userCount === 0 ? 'master_admin' : 'employee';
          const passwordHash = await bcrypt.hash(credentials.password, 12);

          const newUser = {
            _id: uuidv4(),
            email,
            name: credentials.name || email.split('@')[0],
            avatar: '',
            role,
            googleId: null,
            passwordHash,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          await users.insertOne(newUser);
          return { id: newUser._id, email: newUser.email, name: newUser.name, role: newUser.role, image: '' };
        }

        // Login flow
        const user = await users.findOne({ email });
        if (!user) {
          throw new Error('No account found with this email. Please register first.');
        }

        if (!user.passwordHash) {
          throw new Error('This account uses Google Sign-In. Please use the Google button.');
        }

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) {
          throw new Error('Invalid password. Please try again.');
        }

        return { id: user._id, email: user.email, name: user.name, role: user.role, image: user.avatar || '' };
      },
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google') {
        try {
          const dbUser = await getOrCreateOAuthUser(
            { email: profile.email, name: profile.name, image: profile.picture, sub: profile.sub },
            'google'
          );
          user.id = dbUser._id;
          user.role = dbUser.role;
          user.dbName = dbUser.name;
          return true;
        } catch (error) {
          console.error('Google sign-in error:', error);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
        token.name = user.dbName || user.name;
      }
      // Handle session update (e.g., role change)
      if (trigger === 'update' && session) {
        if (session.role) token.role = session.role;
        if (session.name) token.name = session.name;
      }
      // Refresh role from DB periodically
      if (token.userId && !user) {
        try {
          const db = await getDb();
          const dbUser = await db.collection('users').findOne({ _id: token.userId });
          if (dbUser) {
            token.role = dbUser.role;
            token.name = dbUser.name;
            token.picture = dbUser.avatar || token.picture;
          }
        } catch (e) {
          // Silently fail - use cached token data
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.userId;
        session.user.role = token.role;
        session.user.name = token.name;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

// Dynamic Google credentials - override at request time
async function buildAuthOptions() {
  const googleCreds = await getGoogleCreds();
  const opts = { ...authOptions };
  opts.providers = [
    GoogleProvider({
      clientId: googleCreds.clientId,
      clientSecret: googleCreds.clientSecret,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    }),
    opts.providers[1], // Keep credentials provider
  ];
  return opts;
}

async function handler(req, res) {
  const opts = await buildAuthOptions();
  return NextAuth(req, res, opts);
}

export { handler as GET, handler as POST };
