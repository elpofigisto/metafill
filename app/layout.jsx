import "./globals.css";

export const metadata = {
  title: "metafill · poteam.pro",
  description:
    "Fill your App Store metadata in every App Store language. Local, BYOK, by poteam.pro.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="app-footer">
          <span>
            metafill - free &amp; open source by{" "}
            <a href="https://poteam.pro" rel="noreferrer" target="_blank">
              poteam.pro
            </a>
          </span>
          <span>© 2026 Oleksandr Kozlovskyi (poTeam) · MIT License</span>
        </footer>
      </body>
    </html>
  );
}
