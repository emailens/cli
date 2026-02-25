// Type declarations for optional peer dependencies.
// These modules are lazily imported and may not be installed.
declare module "react" {
  const React: any;
  export = React;
}

declare module "@react-email/components" {
  const components: any;
  export = components;
}

declare module "@react-email/render" {
  export function render(element: any): Promise<string>;
}

declare module "mjml" {
  function mjml2html(
    input: string,
    options?: Record<string, unknown>
  ): {
    html: string;
    errors: Array<{
      line: number;
      message: string;
      tagName: string;
      formattedMessage: string;
    }>;
  };
  export default mjml2html;
}

declare module "@maizzle/framework" {
  export function render(
    input: string,
    options: Record<string, unknown>
  ): Promise<{ html: string }>;
}

declare module "playwright-core" {
  export const chromium: {
    connectOverCDP(url: string): Promise<any>;
  };
}
