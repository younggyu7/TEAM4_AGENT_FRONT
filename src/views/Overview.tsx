import { Badge, Empty } from '../components/ui'
import { useDesign } from '../context'
import { SEMANTIC_KIND } from '../labels'

export function Overview() {
  const { design, version, go } = useDesign()
  const { requirements: reqs, functions, data_model: model, questions, issues, completion } = design

  const system = reqs.filter((r) => r.scope === 'SYSTEM')
  const openIssues = issues.filter((i) => i.status !== 'RESOLVED')
  const remarks = openIssues.filter((i) => i.kind.startsWith('SEM_'))
  const problems = openIssues.filter((i) => !i.kind.startsWith('SEM_') && i.severity === 'ERROR')
  const pendingQuestions = questions.filter((q) => q.status === 'PENDING')

  const remarkCounts = Object.entries(SEMANTIC_KIND)
    .map(([kind, [name, owner]]) => ({ kind, name, owner, count: remarks.filter((i) => i.kind === kind).length }))
    .filter((r) => r.count > 0)

  return (
    <div className="overview">
      <section className="panel" aria-labelledby="ov-counts">
        <h2 id="ov-counts" className="panel__title">산출물</h2>
        <div className="tally">
          <button type="button" className="tally__item" onClick={() => go('requirements')}>
            <span className="tally__label">요구사항</span>
            <span className="tally__value">{reqs.length}</span>
            <span className="tally__note">
              기능 {system.filter((r) => r.type === 'FUNCTIONAL').length} · 비기능 {system.filter((r) => r.type === 'NON_FUNCTIONAL').length} · 수행 의무 {reqs.length - system.length}
            </span>
          </button>
          <button type="button" className="tally__item" onClick={() => go('functions')}>
            <span className="tally__label">기능</span>
            <span className="tally__value">{functions.length}</span>
            <span className="tally__note">그룹 {new Set(functions.map((f) => f.group)).size}개</span>
          </button>
          <button type="button" className="tally__item" onClick={() => go('data')}>
            <span className="tally__label">테이블</span>
            <span className="tally__value">{model.entities.length}</span>
            <span className="tally__note">관계 {model.relations.length}</span>
          </button>
          <button type="button" className="tally__item" onClick={() => go('questions')}>
            <span className="tally__label">확인 질문</span>
            <span className="tally__value">{questions.length}</span>
            <span className="tally__note">답변 대기 {pendingQuestions.length}</span>
          </button>
        </div>
      </section>

      <section className="panel" aria-labelledby="ov-db">
        <h2 id="ov-db" className="panel__title">DB 검증</h2>
        <DbValidation />
      </section>

      <section className="panel panel--wide" aria-labelledby="ov-remarks">
        <div className="panel__head">
          <h2 id="ov-remarks" className="panel__title">담당자가 확인할 것</h2>
          <button type="button" className="textbutton" onClick={() => go('issues')}>이슈 전체 보기</button>
        </div>
        {problems.length === 0 && remarkCounts.length === 0 && pendingQuestions.length === 0 ? (
          <Empty>확인할 지적이 없습니다.</Empty>
        ) : (
          <ul className="todo">
            {problems.length > 0 && (
              <li>
                <Badge tone="fail">해결 못 한 오류</Badge>
                <span className="todo__count">{problems.length}건</span>
                <span className="muted">Agent가 수정 한도 안에 고치지 못함</span>
              </li>
            )}
            {pendingQuestions.length > 0 && (
              <li>
                <Badge tone="warn">답변 대기 질문</Badge>
                <span className="todo__count">{pendingQuestions.length}건</span>
                <span className="muted">CLI의 resume으로 답변 (python -m app resume)</span>
              </li>
            )}
            {remarkCounts.map((r) => (
              <li key={r.kind}>
                <Badge tone="info">{r.name}</Badge>
                <span className="todo__count">{r.count}건</span>
                <span className="muted">{r.owner}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel panel--wide" aria-labelledby="ov-checks">
        <h2 id="ov-checks" className="panel__title">완료 조건</h2>
        <ul className="checks">
          {completion.checks.map((c) => (
            <li key={c.name} className={c.passed ? 'checks__item' : 'checks__item checks__item--fail'}>
              <span className="checks__mark" aria-hidden="true">{c.passed ? '✓' : '✕'}</span>
              <span className="checks__name">{c.name}<span className="sr-only">{c.passed ? ' 충족' : ' 미충족'}</span></span>
              <span className="checks__detail">{c.detail}</span>
            </li>
          ))}
        </ul>
        {completion.forced && <p className="note">단계 한도에 닿아 남은 이슈를 둔 채 초안으로 제공한 결과입니다.</p>}
      </section>

      {version?.summary && version.summary.length > 0 && (
        <section className="panel panel--wide" aria-labelledby="ov-steps">
          <div className="panel__head">
            <h2 id="ov-steps" className="panel__title">이 버전을 만든 순서</h2>
            <button type="button" className="textbutton" onClick={() => go('decisions')}>판단 기록 자세히</button>
          </div>
          <ol className="steps">
            {version.summary.map((s) => <li key={s}>{s.replace(/^#\d+\s*/, '')}</li>)}
          </ol>
        </section>
      )}
    </div>
  )
}

function DbValidation() {
  const { version } = useDesign()
  if (!version?.db_validation) {
    return <Empty>이 버전은 DB 검증을 하지 않았습니다. CLI에서 --validate-db로 실행하면 결과가 생깁니다.</Empty>
  }
  const passed = version.db_validation === 'PASSED'
  return (
    <div className="db">
      <p className={passed ? 'db__verdict db__verdict--pass' : 'db__verdict db__verdict--fail'}>
        {passed ? '통과' : '실패'}
      </p>
      <p className="muted">
        {version.db_engine === 'sqlite'
          ? 'SQLite로 대체 검증 (PostgreSQL에 접속하지 못함). PostgreSQL 전용 문법은 확인되지 않았습니다.'
          : `${version.db_engine ?? ''}에서 DDL을 실행해 확인했습니다.`}
      </p>
      {version.db_errors && version.db_errors.length > 0 && (
        <ul className="db__errors">{version.db_errors.map((e) => <li key={e}>{e}</li>)}</ul>
      )}
    </div>
  )
}
