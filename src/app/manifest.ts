import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Company Research Studio",
    short_name: "ResearchStudio",
    description: "BIST ve global piyasalar icin haber, grafik, karsilastirma ve analiz platformu.",
    start_url: "/",
    display: "standalone",
    background_color: "#070b14",
    theme_color: "#0f1728",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  };
}
