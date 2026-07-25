import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#10232D",
        color: "#EDF3F6",
        display: "flex",
        fontSize: 38,
        fontWeight: 700,
        height: "100%",
        justifyContent: "center",
        letterSpacing: "-0.08em",
        position: "relative",
        width: "100%",
      }}
    >
      S
      <span
        style={{
          background: "#2457D6",
          bottom: 8,
          display: "flex",
          height: 4,
          left: 8,
          position: "absolute",
          width: 48,
        }}
      />
    </div>,
    size,
  );
}
