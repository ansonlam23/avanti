import { NotFoundView } from "@/components/landing/not-found-view";

// Any unknown page: the sign was never inked.

export default function NotFound() {
  return (
    <NotFoundView
      eyebrow="Error 404"
      title="Nothing hangs here."
      text="This page doesn't exist. The link may be old or mistyped."
      primary={{ href: "/", label: "Back to avanti" }}
      secondary={{ href: "/start", label: "Find your way in" }}
    />
  );
}
