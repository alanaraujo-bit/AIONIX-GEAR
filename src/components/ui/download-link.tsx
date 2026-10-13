import * as React from "react";

/** Link de download de arquivo gerado pelo servidor (CSV, backup). Não é navegação entre páginas. */
export const DownloadLink = React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>(({ href, children, ...props }, ref) => (
  <a ref={ref} href={href} download {...props}>
    {children}
  </a>
));
DownloadLink.displayName = "DownloadLink";
