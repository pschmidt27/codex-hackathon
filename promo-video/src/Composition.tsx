import { Video } from "@remotion/media";
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const INTRO_END = 90;
const CAPTURE_SLIDE_END = 240;
const VIDEO_1_END = 420;
const VIDEO_1_MOVE_END = 450;
const VIDEO_2_CENTER_END = 570;
const VIDEO_2_MOVE_END = 600;
const VIDEO_3_CENTER_END = 720;
const VIDEO_3_MOVE_END = 750;
const HUB_END = 840;
const TEXT_SCENE_END = 990;
const SCREENSHOT_2_FADE_START = 1080;
const SCREENSHOT_2_FADE_END = 1140;
const MCP_SLIDE_END = 1380;
const VIDEO_4_END = 2430;
const TOTAL_DURATION = 2430;

const centerRect: Rect = {x: 320, y: 140, width: 640, height: 360};
const largeVideoRect: Rect = {x: 210, y: 70, width: 860, height: 580};
const topLeftRect: Rect = {x: 64, y: 56, width: 300, height: 168};
const topCenterRect: Rect = {x: 490, y: 56, width: 300, height: 168};
const topRightRect: Rect = {x: 916, y: 56, width: 300, height: 168};
const logoCenterRect: Rect = {x: 480, y: 235, width: 320, height: 180};
const screenshotRect: Rect = {x: 110, y: 220, width: 1060, height: 450};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const mix = (from: number, to: number, progress: number) => {
  return from + (to - from) * progress;
};

const interpolateRect = (from: Rect, to: Rect, progress: number): Rect => {
  return {
    x: mix(from.x, to.x, progress),
    y: mix(from.y, to.y, progress),
    width: mix(from.width, to.width, progress),
    height: mix(from.height, to.height, progress),
  };
};

const getProgress = (frame: number, start: number, end: number) => {
  return clamp01(interpolate(frame, [start, end], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}));
};

const cardStyle = (rect: Rect, opacity: number): React.CSSProperties => ({
  position: "absolute",
  left: rect.x,
  top: rect.y,
  width: rect.width,
  height: rect.height,
  borderRadius: 24,
  overflow: "hidden",
  opacity,
  boxShadow: "0 28px 80px rgba(15, 23, 42, 0.18)",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  backgroundColor: "#0F172A",
});

const mediaStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
};

const ArrowLine: React.FC<{
  from: {x: number; y: number};
  to: {x: number; y: number};
  opacity: number;
}> = ({from, to, opacity}) => {
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke="#2F6FED"
      strokeWidth={8}
      strokeLinecap="round"
      markerEnd="url(#arrowhead)"
      opacity={opacity}
    />
  );
};

const LogoBlock: React.FC<{
  rect: Rect;
  opacity: number;
  showSubtitle: boolean;
}> = ({rect, opacity, showSubtitle}) => {
  return (
    <div
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.width,
        opacity,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: showSubtitle ? 16 : 10,
        zIndex: 20,
      }}
    >
      <Img
        src={staticFile("logo.png")}
        style={{
          width: rect.width,
          height: "auto",
        }}
      />
      <div
        style={{
          color: "#111827",
          fontSize: showSubtitle ? 52 : 36,
          fontWeight: 700,
          letterSpacing: -1.5,
          lineHeight: 1,
          textAlign: "center",
        }}
      >
        BrainGarden
      </div>
      {showSubtitle ? (
        <div
          style={{
            color: "#4B5563",
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: -0.4,
            textAlign: "center",
          }}
        >
          Your Personal Knowledge Base
        </div>
      ) : null}
    </div>
  );
};

export const MyComposition = () => {
  const frame = useCurrentFrame();

  const introOpacity = 1 - getProgress(frame, INTRO_END - 10, INTRO_END);
  const captureSlideOpacity =
    getProgress(frame, INTRO_END, INTRO_END + 12) *
    (1 - getProgress(frame, CAPTURE_SLIDE_END - 12, CAPTURE_SLIDE_END));
  const finalFade = getProgress(frame, HUB_END, HUB_END + 24);

  const video1Rect = interpolateRect(
    centerRect,
    topLeftRect,
    getProgress(frame, VIDEO_1_END, VIDEO_1_MOVE_END),
  );
  const video2Rect = interpolateRect(
    centerRect,
    topCenterRect,
    getProgress(frame, VIDEO_2_CENTER_END, VIDEO_2_MOVE_END),
  );
  const video3Rect = interpolateRect(
    centerRect,
    topRightRect,
    getProgress(frame, VIDEO_3_CENTER_END, VIDEO_3_MOVE_END),
  );

  const video1Opacity = frame >= CAPTURE_SLIDE_END ? 1 - finalFade : 0;
  const video2Opacity =
    frame >= VIDEO_1_END
      ? getProgress(frame, VIDEO_1_END, VIDEO_1_MOVE_END) * (1 - finalFade)
      : 0;
  const video3Opacity =
    frame >= VIDEO_2_CENTER_END
      ? getProgress(frame, VIDEO_2_CENTER_END, VIDEO_2_MOVE_END) * (1 - finalFade)
      : 0;

  const hubLogoOpacity =
    frame >= VIDEO_3_MOVE_END ? 1 - getProgress(frame, HUB_END - 12, HUB_END) : 0;
  const textSceneOpacity =
    getProgress(frame, HUB_END, HUB_END + 12) *
    (1 - getProgress(frame, TEXT_SCENE_END - 12, TEXT_SCENE_END));

  const screenshot1IntroOpacity = getProgress(frame, TEXT_SCENE_END + 10, TEXT_SCENE_END + 40);
  const screenshotCrossfadeProgress = getProgress(
    frame,
    SCREENSHOT_2_FADE_START,
    SCREENSHOT_2_FADE_END,
  );
  const screenshotsFadeOut = 1 - getProgress(frame, 1230, 1242);
  const screenshot1Opacity =
    screenshot1IntroOpacity * (1 - screenshotCrossfadeProgress) * screenshotsFadeOut;
  const screenshot2Opacity = screenshotCrossfadeProgress * screenshotsFadeOut;
  const outgoingArrowOpacity = frame >= VIDEO_3_MOVE_END ? 1 - finalFade : 0;
  const mcpSlideOpacity =
    getProgress(frame, 1230, 1242) * (1 - getProgress(frame, MCP_SLIDE_END - 12, MCP_SLIDE_END));

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #F8FBFF 0%, #EEF5FF 100%)",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at top, rgba(47, 111, 237, 0.12), transparent 42%)",
        }}
      />

      <LogoBlock rect={{x: 480, y: 170, width: 320, height: 180}} opacity={introOpacity} showSubtitle />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 120px",
          opacity: captureSlideOpacity,
          zIndex: 30,
        }}
      >
        <div
          style={{
            color: "#111827",
            fontSize: 58,
            fontWeight: 700,
            letterSpacing: -1.8,
            lineHeight: 1.1,
            textAlign: "center",
            maxWidth: 980,
          }}
        >
          Capture anything for your personal knowledge base
        </div>
      </div>

      <Sequence from={CAPTURE_SLIDE_END} durationInFrames={TOTAL_DURATION - CAPTURE_SLIDE_END} layout="none">
        <div
          style={{
            ...cardStyle(video1Rect, video1Opacity),
            zIndex: frame < VIDEO_1_MOVE_END ? 12 : 6,
          }}
        >
          <Video src={staticFile("video1.mp4")} muted objectFit="contain" style={mediaStyle} />
        </div>
      </Sequence>

      <Sequence from={VIDEO_1_END} durationInFrames={TOTAL_DURATION - VIDEO_1_END} layout="none">
        <div
          style={{
            ...cardStyle(video2Rect, video2Opacity),
            zIndex: frame < VIDEO_2_MOVE_END ? 13 : 7,
          }}
        >
          <Video src={staticFile("video2.mp4")} muted objectFit="contain" style={mediaStyle} />
        </div>
      </Sequence>

      <Sequence from={VIDEO_2_CENTER_END} durationInFrames={TOTAL_DURATION - VIDEO_2_CENTER_END} layout="none">
        <div
          style={{
            ...cardStyle(video3Rect, video3Opacity),
            zIndex: frame < VIDEO_3_MOVE_END ? 14 : 8,
          }}
        >
          <Video src={staticFile("video3.mp4")} muted objectFit="contain" style={mediaStyle} />
        </div>
      </Sequence>

      <LogoBlock rect={logoCenterRect} opacity={hubLogoOpacity} showSubtitle={false} />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 120px",
          opacity: textSceneOpacity,
          zIndex: 30,
        }}
      >
        <div
          style={{
            color: "#111827",
            fontSize: 58,
            fontWeight: 700,
            letterSpacing: -1.8,
            lineHeight: 1.1,
            textAlign: "center",
            maxWidth: 980,
          }}
        >
          Synthesized into a LLM wiki Obsidian Vault
        </div>
      </div>

      <div
        style={{
          ...cardStyle(screenshotRect, screenshot1Opacity),
          zIndex: 5,
        }}
      >
        <Img
          src={staticFile("screenshot1.jpeg")}
          style={{
            ...mediaStyle,
            objectFit: "contain",
          }}
        />
      </div>

      <div
        style={{
          ...cardStyle(screenshotRect, screenshot2Opacity),
          zIndex: 6,
        }}
      >
        <Img
          src={staticFile("screenshot2.jpeg")}
          style={{
            ...mediaStyle,
            objectFit: "contain",
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 120px",
          opacity: mcpSlideOpacity,
          zIndex: 30,
        }}
      >
        <div
          style={{
            color: "#111827",
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: -1.6,
            lineHeight: 1.12,
            textAlign: "center",
            maxWidth: 980,
          }}
        >
          Access your Knowledge via MCP from your favorite agent
        </div>
      </div>

      <Sequence from={MCP_SLIDE_END} durationInFrames={VIDEO_4_END - MCP_SLIDE_END} layout="none">
        <div
          style={{
            ...cardStyle(largeVideoRect, 1),
            zIndex: 10,
          }}
        >
          <Video src={staticFile("video4.mp4")} muted objectFit="contain" style={mediaStyle} />
        </div>
      </Sequence>

      <svg
        viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 4,
        }}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="12"
            markerHeight="12"
            refX="8"
            refY="6"
            orient="auto"
          >
            <path d="M0,0 L0,12 L12,6 z" fill="#2F6FED" />
          </marker>
        </defs>

        <ArrowLine
          from={{x: topLeftRect.x + topLeftRect.width / 2, y: topLeftRect.y + topLeftRect.height}}
          to={{x: logoCenterRect.x + 40, y: logoCenterRect.y + 70}}
          opacity={outgoingArrowOpacity}
        />
        <ArrowLine
          from={{x: topCenterRect.x + topCenterRect.width / 2, y: topCenterRect.y + topCenterRect.height}}
          to={{x: logoCenterRect.x + logoCenterRect.width / 2, y: logoCenterRect.y + 46}}
          opacity={outgoingArrowOpacity}
        />
        <ArrowLine
          from={{x: topRightRect.x + topRightRect.width / 2, y: topRightRect.y + topRightRect.height}}
          to={{x: logoCenterRect.x + logoCenterRect.width - 40, y: logoCenterRect.y + 70}}
          opacity={outgoingArrowOpacity}
        />
      </svg>
    </AbsoluteFill>
  );
};
