/** Two-tone brand wordmark echoing the logo (red + green). */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`}>
      <span className="wordmark__a">וינו</span>
      <span className="wordmark__b">וינו</span>
    </span>
  );
}
