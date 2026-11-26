export const metadata = {
  title: 'NEXUS | Haute-Couture Streetwear & Luxury Atelier',
  description: 'Interactive 3D hanging rails, curated streetwear silhouettes, and bespoke atelier craftsmanship.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0 }} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
