import { ImageResponse } from "next/og";

export const alt = "Signal Scout — a chain of evidence from source to exact changed lines";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "68px 76px",
        background: "#EDF3F6",
        color: "#10232D",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 24,
          fontWeight: 700,
        }}
      >
        <span>Signal Scout</span>
        <span style={{ fontFamily: "monospace", color: "#2457D6", fontSize: 18 }}>EVIDENCE@1</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", fontSize: 70, fontWeight: 800 }}>Markets move.</div>
        <div style={{ display: "flex", fontSize: 70, fontWeight: 800 }}>
          Your evidence shouldn&apos;t.
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontFamily: "monospace",
          fontSize: 19,
        }}
      >
        {["SOURCE", "CAPTURE", "HASH", "DIFF", "SIGNAL"].map((label, index) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span
              style={{
                display: "flex",
                padding: "12px 18px",
                border: "2px solid #B8C7CE",
                borderRadius: 4,
              }}
            >
              {label}
            </span>
            {index < 4 ? <span style={{ color: "#087C6A" }}>→</span> : null}
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
