interface HomeGreetingProps {
  name: string | null | undefined;
  email: string | null | undefined;
}

export function HomeGreeting({ name, email }: HomeGreetingProps): JSX.Element {
  const display = name && name.trim().length > 0 ? name : (email ?? 'there');
  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">Welcome back, {display}</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Here’s what’s happening across your workflows today.
      </p>
    </div>
  );
}
