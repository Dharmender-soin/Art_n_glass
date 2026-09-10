import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTestTarget } from "../../supabase/functions/whatshub/test-target";
import { WhatsHubTestButton } from "@/components/WhatsHubTestButton";
import { sendWhatsHubTest } from "@/lib/whatshub";

vi.mock("@/lib/whatshub", () => ({ sendWhatsHubTest: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("WhatsHub test destinations", () => {
  it("normalizes local and international phone numbers", () => {
    expect(parseTestTarget("98765 43210")).toEqual({ kind: "phone", target: "919876543210" });
    expect(parseTestTarget("+1 (415) 555-1234")).toEqual({ kind: "phone", target: "14155551234" });
  });
  it("supports modern and older group JIDs", () => {
    expect(parseTestTarget(" 120363392277616357@g.us ").kind).toBe("group");
    expect(parseTestTarget("919876543210-1234567890@g.us").kind).toBe("group");
  });
  it.each(["", "123", "https://chat.whatsapp.com/invite", "abc@g.us", "9876543210@s.whatsapp.net", "call 9876543210", "00000000000"])("rejects invalid destination %s", (value) => {
    expect(() => parseTestTarget(value)).toThrow();
  });
  it("never falls back to a phone for a showroom group test", () => {
    expect(() => parseTestTarget("9876543210", true)).toThrow();
  });
});

describe("WhatsHub test button", () => {
  it("sends the entered unsaved group and displays provider acceptance", async () => {
    vi.mocked(sendWhatsHubTest).mockResolvedValue({ accepted: true });
    render(<WhatsHubTestButton target="12345@g.us" showroomId="showroom-1" />);
    fireEvent.click(screen.getByRole("button"));
    await screen.findByRole("status");
    expect(sendWhatsHubTest).toHaveBeenCalledWith("12345@g.us", "showroom-1");
    expect(screen.getByRole("status")).toHaveTextContent("Check WhatsApp to confirm receipt");
  });
  it("shows errors and allows retry", async () => {
    vi.mocked(sendWhatsHubTest).mockRejectedValue(new Error("Only admin can send integration tests"));
    render(<WhatsHubTestButton target="9876543210" />);
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Only admin");
    expect(screen.getByRole("button")).toBeEnabled();
  });
  it("disables sending while a request is pending", async () => {
    let finish: (value: unknown) => void;
    vi.mocked(sendWhatsHubTest).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<WhatsHubTestButton target="9876543210" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toBeDisabled();
    finish!({ accepted: true });
    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
  });
});
