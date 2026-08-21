import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Download,
  FileText,
  Gauge,
  ListChecks,
  Target,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";

type Executive = {
  name: string;
  role: string;
  initials: string;
  assigned: number;
  newToday: number;
  inProgress: number;
  quotations: number;
  completed: number;
  overdue: number;
  nurturing: number;
  conversion: string;
  revenue: string;
};

const executives: Executive[] = [
  {
    name: "Rahul Sharma",
    role: "Sales Executive",
    initials: "RS",
    assigned: 62,
    newToday: 12,
    inProgress: 18,
    quotations: 11,
    completed: 9,
    overdue: 3,
    nurturing: 21,
    conversion: "18.7%",
    revenue: "₹ 14,25,000",
  },
  {
    name: "Priya Singh",
    role: "Sales Executive",
    initials: "PS",
    assigned: 58,
    newToday: 10,
    inProgress: 16,
    quotations: 9,
    completed: 8,
    overdue: 2,
    nurturing: 23,
    conversion: "17.2%",
    revenue: "₹ 12,80,000",
  },
  {
    name: "Anjali Verma",
    role: "Sales Executive",
    initials: "AV",
    assigned: 45,
    newToday: 9,
    inProgress: 14,
    quotations: 7,
    completed: 6,
    overdue: 4,
    nurturing: 18,
    conversion: "15.6%",
    revenue: "₹ 10,75,000",
  },
  {
    name: "Raina Sharma",
    role: "Sales Executive",
    initials: "RS",
    assigned: 40,
    newToday: 7,
    inProgress: 11,
    quotations: 6,
    completed: 5,
    overdue: 4,
    nurturing: 14,
    conversion: "13.5%",
    revenue: "₹ 8,60,000",
  },
  {
    name: "Aman Singh",
    role: "Sales Executive",
    initials: "AS",
    assigned: 33,
    newToday: 10,
    inProgress: 9,
    quotations: 5,
    completed: 4,
    overdue: 4,
    nurturing: 11,
    conversion: "12.1%",
    revenue: "₹ 6,95,000",
  },
];

const stagePipeline = [
  { label: "New", value: 128, percent: "21.5%", width: "100%" },
  { label: "Requirement Review", value: 96, percent: "16.1%", width: "75%" },
  { label: "Costing", value: 84, percent: "14.1%", width: "66%" },
  { label: "Quotation Sent", value: 62, percent: "10.4%", width: "48%" },
  { label: "Follow-up", value: 58, percent: "9.7%", width: "45%" },
  { label: "Nurturing", value: 72, percent: "12.1%", width: "56%" },
  { label: "Confirmed", value: 36, percent: "6.0%", width: "28%" },
  { label: "Lost", value: 22, percent: "3.7%", width: "17%" },
];

const partners = [
  ["ABC Travels", "₹ 12,45,000", "23%"],
  ["Globe Tours", "₹ 9,80,000", "18%"],
  ["Travel Arc", "₹ 8,60,000", "16%"],
  ["Destiny Holidays", "₹ 6,75,000", "13%"],
  ["Explore India", "₹ 5,20,000", "10%"],
];

const navCardClass =
  "rounded-xl border border-[#173b5e] bg-[#06223c] shadow-[0_8px_24px_rgba(0,0,0,0.18)]";

const smallLabelClass =
  "text-[10px] font-semibold uppercase tracking-[0.02em] text-[#9db1c7]";

function Avatar({ initials, index }: { initials: string; index: number }) {
  const classes = [
    "bg-[#a58b65]",
    "bg-[#b56e5f]",
    "bg-[#5d9a68]",
    "bg-[#6f5a9f]",
    "bg-[#4d7698]",
  ];

  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ring-1 ring-white/15 ${classes[index % classes.length]}`}
    >
      {initials}
    </div>
  );
}

function Trend({
  value,
  positive = true,
}: {
  value: string;
  positive?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${
        positive ? "text-[#58c83f]" : "text-[#ff5a63]"
      }`}
    >
      {positive ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      )}
      {value}
    </span>
  );
}

function KpiCard({
  title,
  value,
  change,
  yesterday,
  icon: Icon,
  iconClass,
  negative = false,
}: {
  title: string;
  value: string;
  change: string;
  yesterday: string;
  icon: typeof Users;
  iconClass: string;
  negative?: boolean;
}) {
  return (
    <div className={`${navCardClass} min-w-0 p-3.5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[12px] font-medium text-[#d5e0eb]">
              {title}
            </p>
            <Trend value={change} positive={!negative} />
          </div>
          <div className="mt-1 flex items-end gap-2">
            <p className="text-[27px] font-bold leading-none tracking-tight text-white">
              {value}
            </p>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-[#8ca4bb]">
            vs yesterday
            <br />
            <span className="text-[#a9bacb]">({yesterday})</span>
          </p>
        </div>

        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
        >
          <Icon className="h-6 w-6 text-white" strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  right,
}: {
  icon: typeof Users;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#173b5e] px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-[#d6e3ee]" />
        <h2 className="truncate text-[14px] font-bold text-white">{title}</h2>
      </div>
      {right}
    </div>
  );
}

function DonutChart() {
  return (
    <div className="relative h-[156px] w-[156px] shrink-0">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(#1767d8 0deg 94deg, #f59a05 94deg 182deg, #38a94c 182deg 250deg, #7042c7 250deg 310deg, #1ca6bd 310deg 360deg)",
        }}
      />
      <div className="absolute inset-[28px] flex flex-col items-center justify-center rounded-full bg-[#06213a]">
        <span className="text-[25px] font-bold text-white">238</span>
        <span className="text-[10px] text-[#91a8bd]">Active Leads</span>
      </div>
    </div>
  );
}

function PipelineBars() {
  return (
    <div className="space-y-2.5 px-4 py-3">
      {stagePipeline.map((stage, index) => (
        <div key={stage.label} className="grid grid-cols-[92px_1fr_34px_38px] items-center gap-2">
          <span
            className={`truncate text-[10px] ${
              stage.label === "Confirmed"
                ? "text-[#5fd34b]"
                : stage.label === "Lost"
                  ? "text-[#ff6268]"
                  : "text-[#c7d4e1]"
            }`}
          >
            {stage.label}
          </span>
          <div className="h-2 overflow-hidden bg-transparent">
            <div
              className={`h-full rounded-r-sm ${
                stage.label === "Confirmed"
                  ? "bg-[#49bf3a]"
                  : stage.label === "Lost"
                    ? "bg-[#ef4b51]"
                    : "bg-[#2674dc]"
              }`}
              style={{ width: stage.width }}
            />
          </div>
          <span className="text-right text-[9px] text-[#d9e3ed]">
            {stage.value}
          </span>
          <span className="text-right text-[9px] text-[#9cb0c4]">
            {stage.percent}
          </span>
        </div>
      ))}
      <div className="mt-2 flex justify-between border-t border-[#173b5e] pt-2 text-[10px]">
        <span className="font-semibold text-white">Total</span>
        <span className="text-[#d4e0eb]">556</span>
        <span className="text-[#9cb0c4]">100%</span>
      </div>
    </div>
  );
}

export default function ManagerDashboard() {
  return (
    <div className="min-h-full w-full bg-[#03182b] text-white">
      <div className="mx-auto w-full max-w-[1500px] px-3 pb-5 pt-3 sm:px-4 lg:px-5">
        {/* Page heading */}
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[21px] font-bold tracking-tight text-white sm:text-[23px]">
                Manager Dashboard — Sales &amp; Queries
              </h1>
              <TrendingUp className="h-5 w-5 text-[#ffd000]" />
            </div>
            <p className="mt-0.5 text-[11px] text-[#91a8bd]">
              360° team performance, assignments, and weekly review overview.
            </p>
          </div>
        </div>

        {/* KPI cards */}
        <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard
            title="New Leads Today"
            value="48"
            change="12%"
            yesterday="43"
            icon={Users}
            iconClass="bg-[#1767d8]"
          />
          <KpiCard
            title="Leads Assigned Today"
            value="36"
            change="8%"
            yesterday="33"
            icon={Users}
            iconClass="bg-[#f28a00]"
          />
          <KpiCard
            title="Tasks Completed Today"
            value="29"
            change="16%"
            yesterday="25"
            icon={CheckCircle2}
            iconClass="bg-[#21b94d]"
          />
          <KpiCard
            title="Pending Quotations"
            value="62"
            change="0%"
            yesterday="62"
            icon={FileText}
            iconClass="bg-[#7627c8]"
          />
          <KpiCard
            title="Follow-ups Due Today"
            value="41"
            change="5%"
            yesterday="39"
            icon={CalendarDays}
            iconClass="bg-[#1767d8]"
            negative
          />
          <KpiCard
            title="Overdue Queries"
            value="17"
            change="13%"
            yesterday="15"
            icon={CircleAlert}
            iconClass="bg-[#f3262f]"
            negative
          />
        </div>

        {/* Main upper row */}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2.05fr)_minmax(330px,1fr)]">
          {/* Team workload */}
          <section className={`${navCardClass} min-w-0 overflow-hidden`}>
            <PanelHeader
              icon={Users}
              title="Team Workload / Executive Performance"
              right={
                <div className="flex items-center gap-2">
                  <button className="hidden h-7 items-center gap-2 rounded-md border border-[#3a5874] bg-[#082640] px-2.5 text-[10px] text-[#d7e1eb] sm:flex">
                    View by: Executive
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <button className="hidden h-7 items-center gap-1.5 rounded-md border border-[#3a5874] bg-[#082640] px-2.5 text-[10px] text-[#d7e1eb] md:flex">
                    <Download className="h-3 w-3" />
                    Export
                  </button>
                </div>
              }
            />

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-[10px]">
                <thead>
                  <tr className="bg-[#08233d] text-[#d2dce7]">
                    <th className="border-r border-[#173b5e] px-3 py-2 text-left font-medium">
                      Executive
                    </th>
                    <th className="border-r border-[#173b5e] px-2 py-2 text-center font-medium">
                      Assigned
                      <br />
                      Leads
                    </th>
                    <th className="border-r border-[#173b5e] px-2 py-2 text-center font-medium">
                      New Today
                    </th>
                    <th className="border-r border-[#173b5e] px-2 py-2 text-center font-medium">
                      In Progress
                    </th>
                    <th className="border-r border-[#173b5e] px-2 py-2 text-center font-medium">
                      Quotations
                      <br />
                      Sent
                    </th>
                    <th className="border-r border-[#173b5e] px-2 py-2 text-center font-medium">
                      Completed
                      <br />
                      Today
                    </th>
                    <th className="border-r border-[#173b5e] px-2 py-2 text-center font-medium">
                      Overdue
                    </th>
                    <th className="border-r border-[#173b5e] px-2 py-2 text-center font-medium">
                      Nurturing
                    </th>
                    <th className="border-r border-[#173b5e] px-2 py-2 text-center font-medium">
                      Monthly
                      <br />
                      Conversion %
                    </th>
                    <th className="px-2 py-2 text-center font-medium">
                      Monthly Revenue / Pipeline Value
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {executives.map((person, index) => (
                    <tr
                      key={person.name}
                      className="border-t border-[#173b5e] hover:bg-[#0a2945]"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar initials={person.initials} index={index} />
                          <div>
                            <div className="font-semibold text-white">
                              {person.name}
                            </div>
                            <div className="text-[9px] text-[#819ab1]">
                              {person.role}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="text-center font-semibold">{person.assigned}</td>
                      <td className="text-center font-semibold">{person.newToday}</td>
                      <td className="text-center font-semibold">{person.inProgress}</td>
                      <td className="text-center font-semibold">{person.quotations}</td>
                      <td className="text-center font-semibold">{person.completed}</td>
                      <td className="text-center font-semibold text-[#ff525b]">{person.overdue}</td>
                      <td className="text-center font-semibold">{person.nurturing}</td>
                      <td className="text-center">
                        <span className="font-semibold text-[#d9e4ee]">{person.conversion}</span>{" "}
                        <Trend value={["2.3%", "1.8%", "2.1%", "1.4%", "1.0%"][index]} />
                      </td>
                      <td className="px-2 text-center">
                        <span className="font-semibold text-[#dce7ef]">{person.revenue}</span>{" "}
                        <Trend value={["12%", "8%", "10%", "6%", "7%"][index]} />
                      </td>
                    </tr>
                  ))}

                  <tr className="border-t border-[#31526f] bg-[#08243e] font-bold">
                    <td className="px-3 py-2 text-white">Team Total</td>
                    <td className="text-center">238</td>
                    <td className="text-center">48</td>
                    <td className="text-center">68</td>
                    <td className="text-center">38</td>
                    <td className="text-center">32</td>
                    <td className="text-center text-[#ff525b]">17</td>
                    <td className="text-center">87</td>
                    <td className="text-center">—</td>
                    <td className="text-center">₹ 53,35,000</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Lead distribution */}
          <section className={`${navCardClass} min-w-0 overflow-hidden`}>
            <PanelHeader
              icon={Users}
              title="Lead Distribution / Assignment"
              right={
                <span className="text-[10px] text-[#8199ae]">Active Leads</span>
              }
            />

            <div className="flex min-h-[274px] flex-col items-center justify-center gap-5 px-4 py-4 sm:flex-row">
              <DonutChart />

              <div className="w-full max-w-[190px] space-y-3">
                {[
                  ["Rahul Sharma", "62", "26%", "#1767d8"],
                  ["Priya Singh", "58", "24%", "#f59a05"],
                  ["Anjali Verma", "45", "19%", "#38a94c"],
                  ["Raina Sharma", "40", "17%", "#7042c7"],
                  ["Aman Singh", "33", "14%", "#1ca6bd"],
                ].map(([name, value, percent, color]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between gap-2 text-[10px]"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="truncate text-[#d7e1eb]">{name}</span>
                    </div>
                    <span className="shrink-0 font-semibold text-white">
                      {value} <span className="text-[#a6b8c9]">({percent})</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 border-t border-[#173b5e]">
              <div className="px-4 py-3">
                <p className={smallLabelClass}>Total Active Leads</p>
                <p className="mt-1 text-[17px] font-bold">238</p>
              </div>
              <div className="border-l border-[#173b5e] px-4 py-3">
                <p className={smallLabelClass}>Avg. Leads / Executive</p>
                <p className="mt-1 text-[17px] font-bold">47.6</p>
              </div>
            </div>
          </section>
        </div>

        {/* Middle row */}
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1.02fr_1.02fr_1.15fr_1.05fr]">
          {/* Daily snapshot */}
          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader
              icon={Users}
              title="Daily Performance Snapshot (Today)"
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[430px] border-collapse text-[9px]">
                <thead>
                  <tr className="bg-[#08233d] text-[#9db0c2]">
                    <th className="px-3 py-2 text-left font-medium">Executive</th>
                    <th className="px-1 py-2 text-center font-medium">
                      Leads
                      <br />
                      Received
                    </th>
                    <th className="px-1 py-2 text-center font-medium">
                      Leads
                      <br />
                      Assigned
                    </th>
                    <th className="px-1 py-2 text-center font-medium">
                      Quotes
                      <br />
                      Sent
                    </th>
                    <th className="px-1 py-2 text-center font-medium">
                      Follow-ups
                      <br />
                      Done
                    </th>
                    <th className="px-1 py-2 text-center font-medium">
                      Tasks
                      <br />
                      Closed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Rahul Sharma", 12, 10, 4, 8, 9],
                    ["Priya Singh", 10, 8, 3, 7, 8],
                    ["Anjali Verma", 9, 7, 3, 6, 6],
                    ["Raina Sharma", 7, 6, 2, 5, 5],
                    ["Aman Singh", 10, 5, 2, 4, 5],
                  ].map((row) => (
                    <tr key={row[0]} className="border-t border-[#173b5e]">
                      <td className="px-3 py-2 font-semibold text-[#dce5ee]">{row[0]}</td>
                      {row.slice(1).map((value, index) => (
                        <td key={index} className="px-1 py-2 text-center text-[#d2deea]">
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t border-[#31526f] bg-[#08243e] font-bold">
                    <td className="px-3 py-2">Total</td>
                    <td className="text-center">48</td>
                    <td className="text-center">36</td>
                    <td className="text-center">14</td>
                    <td className="text-center">30</td>
                    <td className="text-center">33</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Monthly overview */}
          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader
              icon={BarChart3}
              title="Monthly Performance Overview"
              right={<span className="text-[10px] text-[#9bb0c3]">(Aug 2026)</span>}
            />
            <div className="grid grid-cols-3 gap-2 p-3">
              {[
                ["Total Leads", "1,286", "9.3%", true, "vs Jul 26 (1,177)"],
                ["Quotes Sent", "312", "11.6%", true, "vs Jul 26 (279)"],
                ["Confirmed", "142", "8.4%", true, "vs Jul 26 (131)"],
                ["Lost", "48", "2.1%", false, "vs Jul 26 (47)"],
                ["Nurturing", "254", "7.6%", true, "vs Jul 26 (236)"],
                ["Conversion Rate", "11.04%", "0.9%", true, "vs Jul 26 (10.14%)"],
              ].map(([label, value, trend, positive, comparison]) => (
                <div
                  key={label as string}
                  className={`rounded-xl border p-3 ${
                    label === "Conversion Rate"
                      ? "border-[#f0c000] bg-[#102c44]"
                      : "border-[#173b5e] bg-[#082640]"
                  }`}
                >
                  <p className="text-[9px] text-[#b3c1cf]">{label as string}</p>
                  <p className="mt-1 text-[19px] font-bold leading-none">{value as string}</p>
                  <div className="mt-2">
                    <Trend value={`${trend}`} positive={Boolean(positive)} />
                  </div>
                  <p className="mt-1 text-[8px] text-[#829bb0]">{comparison as string}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Pipeline */}
          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader icon={Target} title="Query Stage Pipeline" />
            <PipelineBars />
          </section>

          {/* Weekly review */}
          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader
              icon={UserRound}
              title="Weekly Review / Management Summary"
            />
            <div className="space-y-0">
              {[
                ["Average Response Time", "3h 48m", "12%", true, Clock3],
                ["Average Quotation Turnaround", "28h 32m", "5%", false, Clock3],
                ["Team Conversion Rate", "11.04%", "0.9%", true, Gauge],
              ].map(([label, value, trend, positive, Icon]) => (
                <div
                  key={label as string}
                  className="flex items-center gap-2 border-b border-[#173b5e] px-3 py-2.5"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#d8a900]">
                    <Icon className="h-3.5 w-3.5 text-[#ffd000]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] leading-3 text-[#c5d2de]">{label as string}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-white">{value as string}</p>
                    <Trend value={`${trend}`} positive={Boolean(positive)} />
                  </div>
                </div>
              ))}

              <div className="space-y-2 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#f0a400]">
                    <TrendingUp className="h-3.5 w-3.5 text-[#ffbf00]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] text-[#aabccc]">Top Performer of the Week</p>
                    <p className="text-[10px] font-semibold">Rahul Sharma</p>
                  </div>
                  <div className="text-right text-[8px] text-[#9db1c3]">
                    Highest conversion
                    <br />
                    <span className="font-bold text-[#57c53e]">18.7%</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#ef4048]">
                    <CircleAlert className="h-3.5 w-3.5 text-[#ff525b]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] text-[#aabccc]">Biggest Bottleneck</p>
                    <p className="text-[10px] font-semibold">Follow-ups</p>
                  </div>
                  <p className="text-right text-[8px] text-[#e5edf4]">
                    41 due today | 17 overdue
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#ef4048]">
                    <AlertCircle className="h-3.5 w-3.5 text-[#ff525b]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] text-[#aabccc]">Leads Pending for Action</p>
                  </div>
                  <p className="text-[13px] font-bold">58</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Bottom row */}
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1.45fr_0.95fr_0.72fr]">
          {/* Recent activity */}
          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader icon={Activity} title="Recent Team Activity / Alerts" />
            <div className="grid grid-cols-1 divide-y divide-[#173b5e] md:grid-cols-2 md:divide-x md:divide-y-0">
              <div>
                {[
                  ["Lead assigned to Priya Singh", "Lead L-20876 • Music Group • Europe Tour", "10:15 AM", "red"],
                  ["Quotation sent by Rahul Sharma", "Q-2081 • Corporate Retreat • Madhya Pradesh", "09:48 AM", "green"],
                  ["Follow-up overdue for Anjali Verma", "Lead L-20822 • Family Tour • Rajasthan", "09:30 AM", "red"],
                ].map(([title, detail, time, color]) => (
                  <div key={title} className="flex gap-2 border-b border-[#173b5e] px-3 py-2.5 last:border-b-0">
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                        color === "green" ? "bg-[#20ae47]" : "bg-[#e83840]"
                      }`}
                    >
                      {color === "green" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-white" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold text-white">{title}</p>
                      <p className="truncate text-[8px] text-[#829ab0]">{detail}</p>
                    </div>
                    <span className="shrink-0 text-[8px] text-[#8da4b8]">{time}</span>
                  </div>
                ))}
              </div>

              <div>
                {[
                  ["Client response received from Raina Sharma", "Lead L-20769 • Guided Temple Trail", "Yesterday, 06:20 PM", "green"],
                  ["Query confirmed by Aman Singh", "Lead L-20801 • Golden Triangle Tour", "Yesterday, 05:15 PM", "green"],
                ].map(([title, detail, time, color]) => (
                  <div key={title} className="flex gap-2 border-b border-[#173b5e] px-3 py-2.5 last:border-b-0">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#20ae47]">
                      <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold text-white">{title}</p>
                      <p className="truncate text-[8px] text-[#829ab0]">{detail}</p>
                    </div>
                    <span className="shrink-0 text-[8px] text-[#8da4b8]">{time}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-[#173b5e] px-4 py-2 text-center">
              <button className="text-[10px] font-medium text-[#59a8ff] hover:text-white">
                View all activities →
              </button>
            </div>
          </section>

          {/* Partners */}
          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader
              icon={Users}
              title="Top Travel Partners"
              right={<span className="text-[10px] text-[#9db1c3]">by Revenue</span>}
            />
            <div>
              {partners.map(([name, revenue, share], index) => (
                <div
                  key={name}
                  className="flex items-center gap-2 border-b border-[#173b5e] px-3 py-2 last:border-b-0"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#102f4b] text-[9px] font-bold text-[#dce6ef]">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10px] font-medium">
                    {name}
                  </span>
                  <span className="text-[9px] font-semibold text-[#dce5ed]">
                    {revenue}
                  </span>
                  <span className="w-7 text-right text-[9px] text-[#9fb2c4]">
                    {share}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-[#173b5e] px-4 py-2 text-center">
              <button className="text-[10px] font-medium text-[#59a8ff] hover:text-white">
                View all partners →
              </button>
            </div>
          </section>

          {/* Quick actions */}
          <section className={`${navCardClass} overflow-hidden`}>
            <PanelHeader icon={ListChecks} title="Quick Actions" />
            <div className="grid grid-cols-2 gap-2 p-3">
              <button className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-lg border border-[#244864] bg-[#092945] text-[9px] font-medium text-[#dce6ef] transition hover:border-[#d4aa00] hover:bg-[#0d3150]">
                <Users className="h-5 w-5 text-[#ffbd00]" />
                Assign Leads
              </button>
              <button className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-lg border border-[#244864] bg-[#092945] text-[9px] font-medium text-[#dce6ef] transition hover:border-[#d4aa00] hover:bg-[#0d3150]">
                <CalendarDays className="h-5 w-5 text-[#ff4d55]" />
                Review Overdues
              </button>
              <button className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-lg border border-[#244864] bg-[#092945] text-[9px] font-medium text-[#dce6ef] transition hover:border-[#d4aa00] hover:bg-[#0d3150]">
                <BarChart3 className="h-5 w-5 text-[#74a9d8]" />
                Team Performance
              </button>
              <button className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-lg border border-[#244864] bg-[#092945] text-[9px] font-medium text-[#dce6ef] transition hover:border-[#d4aa00] hover:bg-[#0d3150]">
                <Download className="h-5 w-5 text-[#8caecc]" />
                Export Weekly Review
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}