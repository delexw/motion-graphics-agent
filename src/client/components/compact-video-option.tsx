import { useEffect, useRef, useState } from "react";
import { FileDown, FileArchive, RotateCw, ChevronDown } from "lucide-react";
import { Alert, Button, Dropdown, Progress, Tooltip, Typography } from "antd";
import type { CompactVideoDownload, CompactVideoPreset } from "../../shared/compact-video-download";
import { translateUi } from "../i18n";

function useCompactVideoPreset(baseUrl: string, preset: CompactVideoPreset) {
  const query = preset === "10mb" ? "?preset=10mb" : "";
  const url = baseUrl + query;
  const downloadUrl = baseUrl + "/file" + query;
  const [state, setState] = useState<CompactVideoDownload>({ status: "idle" });
  const [starting, setStarting] = useState(false);
  const pendingStart = useRef(false);
  const requested = useRef(false);
  const readyLink = useRef<HTMLAnchorElement>(null);
  const active = ["queued", "compressing", "checking"].includes(state.status);

  useEffect(() => {
    if (starting || ["ready", "original", "failed"].includes(state.status)) return;
    const controller = new AbortController();
    let checking = false;
    const check = async () => {
      if (checking || pendingStart.current) return;
      checking = true;
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw Error();
        const next: CompactVideoDownload = await response.json();
        if (!controller.signal.aborted && !pendingStart.current) setState(next);
      } catch {
        // Poll again after a temporary connection problem.
      } finally {
        checking = false;
      }
    };
    void check();
    const timer = setInterval(() => void check(), 850);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [url, starting, state.status]);

  useEffect(() => {
    if (state.status === "ready" && requested.current) {
      requested.current = false;
      readyLink.current?.click();
    }
    if (state.status === "original" || state.status === "failed") requested.current = false;
  }, [state.status]);

  async function start() {
    if (pendingStart.current || active || state.status === "original") return;
    if (state.status === "ready") {
      readyLink.current?.click();
      return;
    }
    pendingStart.current = true;
    requested.current = true;
    setStarting(true);
    try {
      const response = await fetch(url, { method: "POST" });
      if (!response.ok) throw Error();
      setState(await response.json());
    } catch {
      setState({ status: "failed" });
    } finally {
      pendingStart.current = false;
      setStarting(false);
    }
  }

  return { state, busy: starting || active, start, readyLink, downloadUrl };
}

export function CompactVideoPresets({ baseUrl }: { baseUrl: string }) {
  const [open, setOpen] = useState(false);
  const quality = useCompactVideoPreset(baseUrl, "quality");
  const limited = useCompactVideoPreset(baseUrl, "10mb");
  const options = [
    { preset: "quality", name: translateUi("50% rate"), icon: FileDown, ...quality },
    { preset: "10mb", name: translateUi("90% rate"), icon: FileArchive, ...limited },
  ];
  const label = translateUi("Compression presets");

  return (
    <>
      <Tooltip title={label} trigger={["hover", "focus"]}>
        <Dropdown
          trigger={["click"]}
          open={open}
          onOpenChange={setOpen}
          autoFocus
          menu={{
            items: options.map(({ preset, name, icon: Icon, state, busy, start }) => ({
              key: preset,
              label: name,
              icon: state.status === "failed" ? <RotateCw size={16} /> : <Icon size={16} />,
              disabled: busy || state.status === "original",
              onClick: () => {
                setOpen(false);
                void start();
              },
            })),
          }}
        >
          <Button
            aria-label={label}
            aria-haspopup="menu"
            aria-expanded={open}
            style={{ minWidth: 54, width: "auto", paddingInline: 8, gap: 4 }}
            icon={<FileDown size={18} aria-hidden="true" />}
          >
            <ChevronDown size={12} aria-hidden="true" />
          </Button>
        </Dropdown>
      </Tooltip>
      {options.map(({ preset, name, state, busy, readyLink, downloadUrl }) => (
        <div key={preset} style={{ width: "100%" }} hidden={!busy && state.status === "idle"}>
          <a ref={readyLink} href={downloadUrl} download hidden aria-hidden="true" />
          {state.status === "ready" && (
            <Typography.Text type="secondary">
              {name} · {Math.round(100 * (1 - state.bytes / state.originalBytes))}%{" "}
              {translateUi("smaller than the original")}
            </Typography.Text>
          )}
          {busy && (
            <div role="status">
              <Typography.Text strong>{name}</Typography.Text>
              <div>
                {translateUi(
                  state.status === "checking"
                    ? "Checking the compact video…"
                    : state.status === "compressing"
                      ? "Compressing video…"
                      : "Waiting to compress…",
                )}
              </div>
              <Progress
                percent={
                  state.status === "compressing"
                    ? state.percent
                    : state.status === "checking"
                      ? 99
                      : 0
                }
                status="active"
                showInfo={state.status === "compressing"}
              />
            </div>
          )}
          {state.status === "original" && (
            <Alert
              type="info"
              title={translateUi(
                preset === "10mb"
                  ? "Kiteva could not make a copy within the 10 MB limit."
                  : "Use the original MP4. A smaller copy did not pass the size and quality checks.",
              )}
            />
          )}
          {state.status === "failed" && (
            <Alert
              type="error"
              title={name}
              description={translateUi(
                "Compression failed. Try again or download the original MP4.",
              )}
            />
          )}
        </div>
      ))}
    </>
  );
}
