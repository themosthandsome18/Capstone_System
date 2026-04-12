import Panel from "./Panel";

function ChartCard({ title, description, action, children, className = "" }) {
  return (
    <Panel
      title={title}
      description={description}
      action={action}
      className={className}
    >
      <div className="h-[245px] md:h-[260px] xl:h-[280px]">{children}</div>
    </Panel>
  );
}

export default ChartCard;
