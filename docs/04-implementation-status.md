# 実装状況

最終基準：`dc1affc`（方向移動コスト体系を刷新）

| 項目 | 状態 | 主な確認先 |
|---|---|---|
| 駒作成・JSON入出力・配置編集 | 公開済み | `App.tsx`, `storage.test.ts` |
| ローカル対局・AI戦・AI対AI・中断再開 | 公開済み | `game.ts`, `ai.ts`, `simulation.ts` |
| direction料金・Usage財布・料金表 | 公開済み / テスト済み | `cost.ts`, `cost.test.ts` |
| leap / jump / cannon / 2回移動 | テスト済み | `game.test.ts`, `growth.test.ts` |
| すり抜け | テスト済み | 移動のみ／通過捕獲選択を含む |
| 突進・反動 | テスト済み | `game.test.ts` |
| 暗躍・零体・結界・道連れ | 実装済み | 対局・AI対AIの継続確認対象 |
| 再生・分裂後再生・強化再生 | 実装済み | `evolution-abilities.test.ts`等 |
| 献身・封印 | 実装済み | `game.ts` |
| 追跡 | テスト済み | `game.test.ts` |
| 鷹狩 | 実装済み | 3育成方式、手動UI確認を継続 |
| 魔神との契約 | テスト済み | `contracts.test.ts` |

継続確認：能力追加後は、AI対AI統計、対局UI、保存・再開後の状態維持を確認する。
