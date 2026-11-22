"use client";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function SignOut() {
  const router = useRouter();
  return (
    <button
      className="ml-auto text-sm text-ink-soft hover:text-ink"
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
        router.refresh();
      }}
    >
      로그아웃
    </button>
  );
}
