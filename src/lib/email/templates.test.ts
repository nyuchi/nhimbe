import { describe, it, expect } from "vitest";
import { hostNewRegistration, registrationConfirmed } from "./templates";

describe("registrationConfirmed", () => {
  const result = registrationConfirmed({
    userName: "Tariro",
    eventName: "Harare Jazz Night",
    eventDate: "Sat, Jun 20, 2026, 6:00 PM",
    eventLocation: "The Book Cafe",
    eventUrl: "https://nhimbe.com/events/evt-1",
  });

  it("builds a confirmation subject naming the event", () => {
    expect(result.subject).toBe("You're registered for Harare Jazz Night");
  });

  it("renders the attendee, event details and CTA into the HTML", () => {
    expect(result.html).toContain("Hi Tariro,");
    expect(result.html).toContain("Harare Jazz Night");
    expect(result.html).toContain("The Book Cafe");
    expect(result.html).toContain("https://nhimbe.com/events/evt-1");
  });

  it("uses the tanzanite palette in the wrapper", () => {
    // Primary moved from malachite (#64FFDA) to tanzanite (#B388FF).
    expect(result.html).toContain("#B388FF");
    expect(result.html).not.toContain("#64FFDA");
  });

  it("provides a plain-text fallback", () => {
    expect(result.text).toContain("You're registered for Harare Jazz Night");
    expect(result.text).toContain("https://nhimbe.com/events/evt-1");
  });
});

describe("hostNewRegistration", () => {
  const result = hostNewRegistration({
    hostName: "Rudo",
    attendeeName: "Tariro",
    eventName: "Harare Jazz Night",
    attendeeCount: 43,
    eventUrl: "https://nhimbe.com/events/evt-1",
  });

  it("builds a subject naming the attendee and event", () => {
    expect(result.subject).toBe("Tariro registered for Harare Jazz Night");
  });

  it("renders the host greeting, attendee and headcount into the HTML", () => {
    expect(result.html).toContain("Hi Rudo,");
    expect(result.html).toContain("Tariro");
    expect(result.html).toContain("Total attendees: 43");
    expect(result.html).toContain("https://nhimbe.com/events/evt-1");
  });

  it("provides a plain-text fallback", () => {
    expect(result.text).toContain("Tariro registered for Harare Jazz Night");
    expect(result.text).toContain("Total attendees: 43");
  });
});
