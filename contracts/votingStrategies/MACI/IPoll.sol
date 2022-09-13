pragma solidity >=0.8.0;
import "./IParams.sol";

interface IPoll is IParams {
    function batchSizes()
        external
        view
        returns (
            uint8,
            uint8,
            uint8
        );

    // TOTO: figure out where to get this or if it's actually needed.
    // function tallyBatchNum() external view returns (uint256);

    function isAfterDeadline() external view returns (bool);

    function numSignUpsAndMessages() external view returns (uint256, uint256);

    function verifySpentVoiceCredits(
        uint256 _totalSpent,
        uint256 _totalSpentSalt
    ) external view returns (bool);

    function verifyPerVOSpentVoiceCredits(
        uint256 _voteOptionIndex,
        uint256 _spent,
        uint256[][] memory _spentProof,
        uint256 _spentSalt
    ) external view returns (bool);
}
