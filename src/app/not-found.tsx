import { NotFoundView } from "@/components/landing/not-found-view";

// Any unknown page: the printer with nothing to print.

export default function NotFound() {
  return (
    <NotFoundView
      eyebrow="Error 404"
      title="Nothing printed here."
      text="This page doesn't exist. The printer is fine; the link isn't."
      primary={{ href: "/", label: "Back to the counter" }}
      secondary={{ href: "/demo", label: "See both sides" }}
    />
  );
}
