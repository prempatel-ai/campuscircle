import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CampusCircle",
    short_name: "CampusCircle",
    description:
      "Anonymous collegiate community — discuss, learn, and connect with your campus peers.",
    start_url: "/feed",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#2F5233",
    background_color: "#F5F6F4",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-512x512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
