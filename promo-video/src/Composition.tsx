import { AbsoluteFill, Img, staticFile } from "remotion";

export const MyComposition = () => {
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ffffff",
        color: "#111827",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        gap: 24,
      }}
    >
      <Img
        src={staticFile("logo.png")}
        style={{
          width: 320,
          height: "auto",
        }}
      />
      <div
        style={{
          fontSize: 52,
          fontWeight: 700,
          letterSpacing: -1.5,
          lineHeight: 1,
        }}
      >
        BrainGarden
      </div>
    </AbsoluteFill>
  );
};
