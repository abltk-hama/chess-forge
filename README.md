# Chess Forge

30ポイントの能力予算でオリジナル駒を作り、対称な編成で遊ぶブラウザ版チェスです。

## 開発

```sh
npm install
npm run dev
```

## 検証

```sh
npm run build
npm test
npm run lint
```

## MVP機能

- 方向移動、固定跳躍、飛び越し、王冠能力による駒作成
- コスト上限30と移動プレビュー
- ルーク、ナイト、ビショップ、クイーン枠の対称置換
- クラシック拡張、ロイヤルハントANY、ロイヤルハントALL
- ローカル二人対戦、投了、合意引き分け、手の履歴
- LocalStorage保存とJSON入出力
