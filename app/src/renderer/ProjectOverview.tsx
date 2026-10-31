interface ProjectOverviewProps {
  notice?: string | null;
}

export function ProjectOverview({ notice }: ProjectOverviewProps) {
  return <section className="ov native-scroll" role="region" aria-label="Overview">
    {notice && <div className="canvas-notice" role="status">{notice}</div>}
  </section>;
}
