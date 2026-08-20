# Chess Forge 引継ぎ

## 新しいチャットで読む順序

1. `docs/00-project-overview.md`
2. この文書
3. 該当仕様書（`01-game-and-editor.md`または`03-abilities.md`）
4. `docs/04-implementation-status.md`
5. 対象コードとテスト

## 現在地

- 基準コミット：`dc1affc`（方向移動コスト体系を刷新）
- ブランチ：`main`
- 公開状態：`origin/main`と同一
- 最終検証：15テストファイル / 121テスト、`npm run build`、`npm run lint` 成功
- 保存互換：Definition JSON構造を維持し、新しいコスト式で再評価

## 現行の重要仕様

- directionはUsage財布方式。
- すり抜けは移動のみ／通過捕獲を対局中に選択できる。
- 追跡は固定跳躍セット単位、期限は1/2手。
- 鷹狩には連携型・狩猟型・援護型がある。
- 魔神との契約は成長・変身限定。

## 作業開始コマンド

```powershell
cd "C:\Users\nibgc\Documents\ChatGPT\オリジナル駒チェス"
git status -sb
git log -3 --oneline --decorate
npm test -- --run
```

## 運用

- 仕様検討チャット：`03-abilities.md`と`05-decisions.md`を更新する。
- 実装チャット：変更前に仕様・コード・テストを照合し、完了時に`04-implementation-status.md`とこの文書を更新する。
- 新能力では型、コスト、合法手、状態遷移、UI、AI、保存、テストを確認する。
- コミット・pushはユーザーが行う。実装チャットは最後にPowerShellコマンドを提示する。

## 次の候補

1. 新しい追加能力の仕様検討
2. 実装済み能力のAI対AIによるバランス確認
3. 能力詳細表示と統計の拡充
