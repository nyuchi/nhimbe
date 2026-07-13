import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { WeatherEmbed } from "./weather-embed";

describe("WeatherEmbed", () => {
  it("renders an accessible iframe pointing at the Mukoko widget", () => {
    render(<WeatherEmbed location="Harare" />);
    const frame = screen.getByTitle("Weather for Harare");
    expect(frame.tagName).toBe("IFRAME");
    const src = frame.getAttribute("src") ?? "";
    expect(src).toContain("weather.mukoko.com/embed/widget");
    expect(src).toContain("location=harare");
    expect(src).toContain("type=current");
  });

  it("passes through the widget type and a custom title", () => {
    render(<WeatherEmbed location="Bulawayo" type="5day" title="5-day forecast" />);
    const frame = screen.getByTitle("5-day forecast");
    expect(frame.getAttribute("src")).toContain("type=5day");
  });

  it("renders nothing for online / empty locations", () => {
    const { container: online } = render(<WeatherEmbed location="Online" />);
    expect(online.querySelector("iframe")).toBeNull();
    const { container: empty } = render(<WeatherEmbed location="" />);
    expect(empty.querySelector("iframe")).toBeNull();
  });
});
