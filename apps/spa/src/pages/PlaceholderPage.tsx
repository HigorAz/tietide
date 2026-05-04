export interface PlaceholderPageProps {
  title: string;
}

export function PlaceholderPage({ title }: PlaceholderPageProps): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-text-secondary">
        Coming soon — this section is under construction.
      </p>
    </div>
  );
}

export default PlaceholderPage;
