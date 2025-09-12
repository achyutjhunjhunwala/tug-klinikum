// Global browser APIs for use in page.evaluate() contexts
declare global {
  interface Navigator {
    userAgent: string;
  }

  interface Screen {
    width: number;
    height: number;
  }

  const navigator: Navigator;
  const screen: Screen;
}

export {};