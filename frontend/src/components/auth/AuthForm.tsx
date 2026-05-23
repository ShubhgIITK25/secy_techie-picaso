"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AuthMode = "login" | "signup" | "verify";

type AuthFormProps = {
  mode: AuthMode;
};

const copy: Record<
  AuthMode,
  {
    title: string;
    subtitle: string;
    cta: string;
  }
> = {
  login: {
    title: "Welcome back",
    subtitle: "Sign in with your email and password.",
    cta: "Log in",
  },
  signup: {
    title: "Create your account",
    subtitle: "Register with a username, email, and password.",
    cta: "Sign up",
  },
  verify: {
    title: "Verify your email",
    subtitle: "Enter the verification code sent to your inbox.",
    cta: "Verify email",
  },
};

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    code: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const authApiBase = process.env.NEXT_PUBLIC_AUTH_API_BASE_URL ?? "/api/auth";

  const getEndpoint = () => {
    if (mode === "login") return `${authApiBase}/login`;
    if (mode === "signup") return `${authApiBase}/signup`;
    return `${authApiBase}/verify-email`;
  };

  const getPayload = () => {
    if (mode === "verify") {
      const email =
        formData.email || (typeof window !== "undefined" ? localStorage.getItem("auth_email") ?? "" : "");
      if (!email) return null;
      return { email, code: formData.code };
    }

    if (mode === "signup") {
      return {
        username: formData.username,
        email: formData.email,
        password: formData.password,
      };
    }

    return {
      email: formData.email,
      password: formData.password,
    };
  };

  const getErrorMessage = async (response: Response) => {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      try {
        const data = await response.json();
        if (typeof data?.message === "string" && data.message.trim()) {
          return data.message;
        }
      } catch {
        return "Request failed. Please try again.";
      }
    }

    if (mode === "verify") {
      return "Invalid verification code";
    }

    if (mode === "login") {
      return "Invalid credentials";
    }

    if (mode === "signup") {
      return "Signup failed";
    }

    return "Request failed. Please try again.";
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage(null);
    setIsSubmitting(true);

    try {
      const payload = getPayload();
      if (!payload) {
        setStatusMessage("No email found. Please go to signup or login first.");
        setIsSubmitting(false);
        return;
      }

      const response = await fetch(getEndpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setStatusMessage(await getErrorMessage(response));
        return;
      }

      if (mode === "signup") {
        // persist email so verify flow doesn't need it typed again
        try {
          localStorage.setItem("auth_email", formData.email);
        } catch {}

        setStatusMessage("Signup successful. Check your email to verify your account.");
        router.push("/verify-email");
        return;
      }

      if (mode === "verify") {
        setStatusMessage("Email verified successfully.");
        router.push("/login");
        return;
      }

      setStatusMessage("Login successful.");
      try {
        localStorage.setItem("auth_email", formData.email);
        localStorage.setItem("auth_logged_in", "true");
        const data = await response.json().catch(() => ({}));
        if (typeof data?.user?.username === "string") {
          localStorage.setItem("auth_username", data.user.username);
        }
        if (typeof data?.user?.email === "string") {
          localStorage.setItem("auth_email", data.user.email);
        }
      } catch {}
      router.push("/");
    } catch {
      setStatusMessage("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (field: keyof typeof formData, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const fields = () => {
    if (mode === "verify") {
      return (
        <label className="space-y-2">
          <span className="text-sm font-medium text-gray">Verification code</span>
          <input
            value={formData.code}
            onChange={(event) => updateField("code", event.target.value)}
            placeholder="6-digit code"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-400"
          />
        </label>
      );
    }

    return (
      <>
        {mode === "signup" && (
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray">Username</span>
            <input
              value={formData.username}
              onChange={(event) => updateField("username", event.target.value)}
              placeholder="yourname"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-400"
            />
          </label>
        )}

        <label className="space-y-2">
          <span className="text-sm font-medium text-gray">Email</span>
          <input
            type="email"
            value={formData.email}
            onChange={(event) => updateField("email", event.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-400"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-gray">Password</span>
          <input
            type="password"
            value={formData.password}
            onChange={(event) => updateField("password", event.target.value)}
            placeholder="Enter your password"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-400"
          />
        </label>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 px-4 py-10 text-black">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center justify-center">
        <form
          onSubmit={handleSubmit}
          className="w-full space-y-4 rounded-2xl border border-[#eadfca] bg-[#f3e7cf] p-6 shadow-sm"
        >
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">{copy[mode].title}</h1>
            <p className="text-sm text-black/70">{copy[mode].subtitle}</p>
          </div>

          <div className="space-y-4">{fields()}</div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-black px-4 py-3 font-medium text-[#f7f1e3] transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Please wait..." : copy[mode].cta}
          </button>

          {mode === "verify" && (
            <div className="pt-2">
              <Link
                href="/signup"
                className="block w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 text-center text-black"
              >
                Back
              </Link>
            </div>
          )}

          {statusMessage && (
            <p className="rounded-xl border border-black/10 bg-[#f7f1e3] px-4 py-3 text-sm text-black">
              {statusMessage}
            </p>
          )}

          <div className="text-center text-sm text-black/70">
            {mode === "login" && (
              <span>
                No account? <Link href="/signup" className="text-black underline">Sign up</Link>
              </span>
            )}
            {mode === "signup" && (
              <span>
                Already have an account? <Link href="/login" className="text-black underline">Log in</Link>
              </span>
            )}
            {mode === "verify" && <span>Check your email for the verification code.</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
