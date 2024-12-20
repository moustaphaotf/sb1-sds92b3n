import { PrismaAdapter } from "@auth/prisma-adapter";
import { NextAuthOptions, Session, User as NextAuthUser } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { compare } from "bcrypt";
import { JWT } from "next-auth/jwt";
import { removeCurrentSchoolCookie } from "./utils/cookies";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  // @ts-ignore
  adapter: PrismaAdapter(db),
  session: {
    strategy: "jwt",
    maxAge: 10 * 60, // 10 minutes
  },
  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
    signOut: "/auth/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials): Promise<Session["user"] | null> {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const user = await db.user.findUnique({
            where: {
              email: credentials.email,
            },
            select: {
              id: true,
              email: true,
              password: true,
              firstName: true,
              lastName: true,
            },
          });

          if (!user) {
            return null;
          }

          const isPasswordValid = await compare(
            credentials.password,
            user.password
          );

          if (!isPasswordValid) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          };
        } catch (error) {
          console.error("[AUTH_ERROR]", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({
      token,
      user,
      trigger,
      session,
    }: {
      token: JWT;
      user: any;
      trigger?: "signIn" | "signUp" | "update";
      session?: any;
    }): Promise<JWT> {
      // Initial sign in
      if (user) {
        return {
          ...token,
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        };
      }

      // Handle session updates
      if (trigger === "update" && session) {
        return { ...token, ...session };
      }

      // Return previous token if the user hasn't changed
      return token;
    },

    async session({
      token,
      session,
    }: {
      token: JWT;
      session: Session;
    }): Promise<Session> {
      if (token) {
        session.user = {
          id: token.id as string,
          email: token.email as string,
          firstName: token.firstName as string,
          lastName: token.lastName as string,
        };
      }
      return session;
    },
  },
  events: {
    signOut: () => {
      removeCurrentSchoolCookie();
    },
  },
};
