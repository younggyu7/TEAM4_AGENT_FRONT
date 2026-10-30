import { Empty, IdList } from '../components/ui'
import { useDesign } from '../context'
import { AGENT, label } from '../labels'

export function Decisions() {
  const { design } = useDesign()
  if (design.decisions.length === 0) return <Empty>판단 기록이 없습니다.</Empty>
  return (
    <div>
      <p className="note">조정 Agent가 단계마다 무엇을 왜 골랐고, 실행한 결과가 어땠는지입니다.</p>
      <ol className="timeline">
        {design.decisions.map((d) => (
          <li key={d.step} className="timeline__item">
            <span className="timeline__step" aria-label={`${d.step}단계`}>{d.step}</span>
            <div className="timeline__body">
              <h3 className="timeline__title">
                {label(AGENT, d.action)}
                {d.mode && <span className="muted"> · {d.mode}</span>}
              </h3>
              <p className="timeline__reason">{d.reason}</p>
              {d.result && <p className="timeline__result">{d.result}</p>}
              {d.scope.length > 0 && <p className="meta">범위 <IdList ids={d.scope} /></p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
