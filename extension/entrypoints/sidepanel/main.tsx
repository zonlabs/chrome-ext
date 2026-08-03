import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../assets/main.css";

const root = document.getElementById("root")!;
createRoot(root).render(
  <StrictMode>
    <div style={{ width: "100vw", height: "100vh", background: "#131314", color: "#e3e3e3", display: "grid", placeItems: "center", fontFamily: "Inter, sans-serif" }}>
      Obot
    </div>
  </StrictMode>
);
