import * as React from "react";

export interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  priority?: boolean;
}

export default function Image({ priority, alt = "", ...props }: ImageProps) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img loading={priority ? "eager" : "lazy"} decoding="async" alt={alt} {...props} />;
}
