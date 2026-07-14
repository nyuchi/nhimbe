import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { I18nProvider, useT } from "./i18n-provider";
import { LOCALE_STORAGE_KEY } from "./index";

// The shared test setup at `src/__tests__/setup.ts` already swaps
// `global.localStorage` for a vi-mocked object and clears it before each
// test. We pull on it here to assert reads + writes.
const localStorageMock = global.localStorage as unknown as {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
};

function TestConsumer() {
  const { locale, setLocale, t } = useT();
  return (
    <div>
      <div data-testid="locale">{locale}</div>
      <div data-testid="nav-home">{t("nav.home")}</div>
      <div data-testid="circle-title">{t("circle.title")}</div>
      <div data-testid="circle-empty">{t("circle.empty")}</div>
      <button type="button" data-testid="to-sn" onClick={() => setLocale("sn")}>
        sn
      </button>
      <button type="button" data-testid="to-en" onClick={() => setLocale("en")}>
        en
      </button>
    </div>
  );
}

describe("I18nProvider", () => {
  beforeEach(() => {
    // The shared setup resets mocks, but be explicit about the default.
    localStorageMock.getItem.mockReturnValue(null);
  });

  it("defaults to English when nothing is stored", () => {
    render(
      <I18nProvider>
        <TestConsumer />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("nav-home").textContent).toBe("Home");
    expect(screen.getByTestId("circle-empty").textContent).toBe(
      "No posts yet — be the first to spark the fire.",
    );
  });

  it("hydrates the locale from localStorage on mount", () => {
    localStorageMock.getItem.mockImplementation((key: string) =>
      key === LOCALE_STORAGE_KEY ? "sn" : null,
    );
    render(
      <I18nProvider>
        <TestConsumer />
      </I18nProvider>,
    );
    // After mount effect runs, the consumer should show Shona.
    expect(screen.getByTestId("locale").textContent).toBe("sn");
    expect(screen.getByTestId("nav-home").textContent).toBe("Kumba");
  });

  it("re-renders consumers when setLocale flips the locale", () => {
    render(
      <I18nProvider>
        <TestConsumer />
      </I18nProvider>,
    );
    expect(screen.getByTestId("nav-home").textContent).toBe("Home");
    expect(screen.getByTestId("circle-title").textContent).toBe("Circles");

    act(() => {
      screen.getByTestId("to-sn").click();
    });

    expect(screen.getByTestId("locale").textContent).toBe("sn");
    expect(screen.getByTestId("nav-home").textContent).toBe("Kumba");
    // Same key, different string — proving the consumer actually re-rendered.
    expect(screen.getByTestId("circle-empty").textContent).toBe(
      "Hapana zvakanyorwa — iva wekutanga kubatidza moto.",
    );
  });

  it("persists the new locale to localStorage on setLocale", () => {
    render(
      <I18nProvider>
        <TestConsumer />
      </I18nProvider>,
    );

    act(() => {
      screen.getByTestId("to-sn").click();
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, "sn");

    act(() => {
      screen.getByTestId("to-en").click();
    });

    expect(localStorageMock.setItem).toHaveBeenLastCalledWith(LOCALE_STORAGE_KEY, "en");
  });

  it("falls back to English when a key is missing in the target locale", () => {
    // Shona table currently mirrors every English key, so we sanity-check the
    // fallback chain by asking for a bogus key — it should echo the key.
    function MissingKeyConsumer() {
      const { t } = useT();
      return <span data-testid="missing">{t("does.not.exist")}</span>;
    }
    render(
      <I18nProvider>
        <MissingKeyConsumer />
      </I18nProvider>,
    );
    expect(screen.getByTestId("missing").textContent).toBe("does.not.exist");
  });

  it("throws when useT is used outside a provider", () => {
    function Orphan() {
      useT();
      return null;
    }
    // React logs the error to console; silence it for a clean test run.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow(/useT must be used within an I18nProvider/);
    spy.mockRestore();
  });
});
