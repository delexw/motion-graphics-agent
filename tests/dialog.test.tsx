import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement } from "react";
import type { ModalProps } from "antd";
import { Dialog } from "../src/client/dialog";
const captured = vi.hoisted(() => ({ props: undefined as ModalProps | undefined }));
vi.mock("antd", async (importOriginal) => ({
  ...(await importOriginal<typeof import("antd")>()),
  Modal: (props: ModalProps) => {
    captured.props = props;
    return <>{props.children}</>;
  },
}));
describe("Ant Design dialog", () => {
  it("delegates focus, close and footer handling while scrolling only the content", () => {
    const onClose = vi.fn();
    const markup = renderToStaticMarkup(
      <Dialog
        title="Motion Graphic details"
        onClose={onClose}
        footer={<button>Use this Motion Graphic</button>}
        wide
      >
        <p>Scrollable content</p>
      </Dialog>,
    );
    const modal = captured.props;
    if (!modal) throw Error("Expected the rendered Modal");
    expect(modal).toMatchObject({
      open: true,
      title: "Motion Graphic details",
      focusable: { trap: true, focusTriggerAfterClose: true },
      width: "calc(100vw - 32px)",
      centered: true,
      styles: {
        container: { height: "calc(100dvh - 32px)", display: "flex", flexDirection: "column" },
        body: { flex: 1, minHeight: 0 },
      },
    });
    expect(markup).toContain('class="dialog-body"');
    expect(markup).toContain("scrollbar-width:thin");
    expect(markup).toContain(" transparent");
    expect(markup).toContain("<p>Scrollable content</p>");
    if (!isValidElement(modal.footer)) throw Error("Expected the supplied footer");
    expect(renderToStaticMarkup(modal.footer)).toContain("Use this Motion Graphic");
    expect(modal.onCancel).toBe(onClose);
    Reflect.apply(modal.onCancel!, undefined, []);
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("omits default confirmation buttons when no footer is supplied", () => {
    renderToStaticMarkup(
      <Dialog title="Preview" onClose={() => {}}>
        Content
      </Dialog>,
    );
    expect(captured.props?.footer).toBeNull();
  });
});
