import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceApproval } from "./device-approval";

const mocks = vi.hoisted(() => {
  const device = Object.assign(vi.fn(), {
    approve: vi.fn(),
    deny: vi.fn(),
  });
  return { device };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: { device: mocks.device },
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function approveButton() {
  return screen.getByRole("button", { name: "Approve" });
}

describe("DeviceApproval", () => {
  it("keeps approval disabled until the requesting client loads", async () => {
    let resolveRequest: (value: unknown) => void = () => {};
    mocks.device.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    render(<DeviceApproval userCode="ABCD1234" onDone={vi.fn()} />);

    expect(mocks.device).toHaveBeenCalledWith({
      query: { user_code: "ABCD1234" },
    });
    expect(approveButton()).toBeDisabled();

    resolveRequest({
      data: {
        user_code: "ABCD1234",
        status: "pending",
        client_id: "kaneo-mcp",
        scope: "openid profile",
      },
      error: null,
    });

    await waitFor(() => expect(approveButton()).toBeEnabled());
    expect(screen.getByText("kaneo-mcp")).toBeInTheDocument();
    expect(screen.getByText(/Kaneo MCP server/)).toBeInTheDocument();
    expect(screen.getByText("openid")).toBeInTheDocument();
    expect(screen.getByText("profile")).toBeInTheDocument();
  });

  it("approves the code once the request is shown", async () => {
    mocks.device.mockResolvedValue({
      data: {
        user_code: "ABCD1234",
        status: "pending",
        client_id: "kaneo-cli",
        scope: null,
      },
      error: null,
    });
    mocks.device.approve.mockResolvedValue({
      data: { success: true },
      error: null,
    });
    const onDone = vi.fn();

    render(<DeviceApproval userCode="ABCD1234" onDone={onDone} />);

    await waitFor(() => expect(approveButton()).toBeEnabled());
    expect(screen.getByText("None")).toBeInTheDocument();

    fireEvent.click(approveButton());

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mocks.device.approve).toHaveBeenCalledWith({ userCode: "ABCD1234" });
  });

  it("does not allow approval when the request is not shown to this user", async () => {
    mocks.device.mockResolvedValue({
      data: { user_code: "ABCD1234", status: "pending" },
      error: null,
    });

    render(<DeviceApproval userCode="ABCD1234" onDone={vi.fn()} />);

    expect(
      await screen.findByText("This request belongs to another account."),
    ).toBeInTheDocument();
    expect(approveButton()).toBeDisabled();
    expect(mocks.device.approve).not.toHaveBeenCalled();
  });

  it("does not allow approval for an invalid code", async () => {
    mocks.device.mockResolvedValue({
      data: null,
      error: { error_description: "Invalid user code" },
    });

    render(<DeviceApproval userCode="ABCD1234" onDone={vi.fn()} />);

    expect(await screen.findByText("Invalid user code")).toBeInTheDocument();
    expect(approveButton()).toBeDisabled();
  });

  it("does not allow approval for a request that was already handled", async () => {
    mocks.device.mockResolvedValue({
      data: {
        user_code: "ABCD1234",
        status: "approved",
        client_id: "kaneo-cli",
        scope: null,
      },
      error: null,
    });

    render(<DeviceApproval userCode="ABCD1234" onDone={vi.fn()} />);

    expect(
      await screen.findByText("This request was already approved."),
    ).toBeInTheDocument();
    expect(approveButton()).toBeDisabled();
  });
});
