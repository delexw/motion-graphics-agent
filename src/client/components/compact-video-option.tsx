import { useEffect, useRef, useState } from "react";
import { FileDown, RotateCw } from "lucide-react";
import { DownloadIconButton } from "./download-icon-button";
import { Alert, Flex, Progress, Typography } from "antd";
import type { CompactVideoDownload } from "../../shared/compact-video-download";
import { translateUi } from "../i18n";

export function CompactVideoOption({ url }: { url: string }) {
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
    if (pendingStart.current || active) return;
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

  return (
    <Flex vertical gap="small" align="start">
      <Typography.Text>
        {translateUi("Make a smaller MP4 at the original resolution.")}
      </Typography.Text>
      {state.status === "ready" ? (
        <>
          <a ref={readyLink} href={`${url}/file`} download hidden aria-hidden="true" />
          <DownloadIconButton
            href={`${url}/file`}
            download
            icon={<FileDown size={18} aria-hidden="true" />}
            label={translateUi("Download compact MP4")}
          />
          <Typography.Text type="secondary">
            {Math.round(100 * (1 - state.bytes / state.originalBytes))}%{" "}
            {translateUi("smaller than the original")}
          </Typography.Text>
        </>
      ) : state.status === "original" ? (
        <Alert
          type="info"
          title={translateUi(
            "Use the original MP4. A smaller copy did not pass the size and quality checks.",
          )}
        />
      ) : (
        <>
          <DownloadIconButton
            type="primary"
            onClick={() => void start()}
            disabled={active || starting}
            label={translateUi(
              state.status === "failed" ? "Retry compression" : "Download compact MP4",
            )}
            icon={
              state.status === "failed" ? (
                <RotateCw size={18} aria-hidden="true" />
              ) : (
                <FileDown size={18} aria-hidden="true" />
              )
            }
          />
          {(active || starting) && (
            <div style={{ width: "100%" }} role="status">
              {translateUi(
                state.status === "checking"
                  ? "Checking the compact video…"
                  : state.status === "compressing"
                    ? "Compressing video…"
                    : "Waiting to compress…",
              )}
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
          {state.status === "failed" && (
            <Alert
              type="error"
              title={translateUi("Compression failed. Try again or download the original MP4.")}
            />
          )}
        </>
      )}
    </Flex>
  );
}
