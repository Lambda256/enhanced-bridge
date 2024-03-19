### Compile 시 Contract 의 Storage layout 확인 방법
1. `solc`
```bash
solc @openzeppelin/=node_modules/@openzeppelin/ --storage-layout contracts/EnhancedMainBridge.sol
```
2. `hardhat`
```bash
npx hardhat check
```
