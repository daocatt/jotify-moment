import React, { Suspense } from "react";

export default function dynamic<P extends object>(
  importer: () => Promise<{ default: React.ComponentType<P> } | React.ComponentType<P>>,
  options?: { ssr?: boolean; loading?: () => React.ReactNode }
) {
  const LazyComponent = React.lazy(async () => {
    const mod = await importer();
    return "default" in mod ? mod : { default: mod };
  });

  return function DynamicComponent(props: P) {
    return (
      <Suspense fallback={options?.loading ? options.loading() : null}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}
