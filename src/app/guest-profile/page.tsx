import { Suspense } from "react";
import { GuestProfileClient } from "./guest-profile-client";

export default function GuestProfilePage() {
  return (
    <Suspense>
      <GuestProfileClient />
    </Suspense>
  );
}
