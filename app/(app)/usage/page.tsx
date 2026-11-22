import { getUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";

type U = { calls: number; errors: number; input: number; output: number; p50: number | null; p95: number | null };

export default async function Usage() {
  const userId = (await getUserId())!;
  const [u] = await withUser(userId, (q) =>
    q<U>(
      // 이번 달(한국 시간) 호출 수·오류·토큰·지연 시간 분위수
      `select count(*)::int as calls, count(*) filter (where not ok)::int as errors,
              coalesce(sum(input_tokens),0)::int as input, coalesce(sum(output_tokens),0)::int as output,
              (percentile_cont(0.5) within group (order by latency_ms))::int as p50,
              (percentile_cont(0.95) within group (order by latency_ms))::int as p95
       from usage_logs
       where created_at >= date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'`,
    ),
  );
  const rate = u.calls ? ((u.errors / u.calls) * 100).toFixed(1) : "0";
  const ms = (n: number | null) => (n == null ? "-" : `${n.toLocaleString("ko-KR")}ms`);
  const rows: [string, string][] = [
    ["호출 수", `${u.calls.toLocaleString("ko-KR")}회`],
    ["오류율", `${rate}% (${u.errors}회)`],
    ["입력 토큰", u.input.toLocaleString("ko-KR")],
    ["출력 토큰", u.output.toLocaleString("ko-KR")],
    ["응답 시간 중앙값", ms(u.p50)],
    ["응답 시간 p95", ms(u.p95)],
  ];
  return (
    <main className="mx-auto max-w-xl px-5 pb-16 pt-8">
      <h1 className="text-2xl font-bold">이번 달 사용량</h1>
      <dl className="mt-6 border-t border-ink">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-rule py-3">
            <dt className="text-ink-soft">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-ink-soft">응답 시간에는 데이터베이스 첫 연결 지연이 섞여 있을 수 있어요.</p>
    </main>
  );
}
