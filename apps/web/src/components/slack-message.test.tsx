import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SlackMessage } from "./slack-message";

describe("SlackMessage", () => {
  it("renders formatting, links, lists and line breaks", () => {
    const { container } = render(
      <SlackMessage text={"*Reset* it _now_:\nsee <https://wiki.example.org/pw|the guide>\n• one\n• two"} />,
    );
    expect(screen.getByText("Reset").tagName).toBe("STRONG");
    expect(screen.getByText("now").tagName).toBe("EM");
    const link = screen.getByRole("link", { name: "the guide" });
    expect(link).toHaveAttribute("href", "https://wiki.example.org/pw");
    expect(link).toHaveAttribute("rel", "noreferrer noopener");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["one", "two"]);
    expect(container.querySelectorAll("br")).toHaveLength(1);
  });

  it("never renders markup from the message", () => {
    const { container } = render(<SlackMessage text={"<img src=x onerror=alert(1)>"} />);
    expect(container.querySelector("img")).toBeNull();
  });
});
