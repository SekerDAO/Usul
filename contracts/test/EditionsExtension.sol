// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @dev ERC721 token with editions extension.
 */
abstract contract EditionsExtension is ERC721URIStorage {
    using Strings for uint256;

    // eip-712
    struct EIP712Domain {
        string name;
        string version;
        uint256 chainId;
        address verifyingContract;
    }

    // Contents of message to be signed
    struct Signature {
        address verificationAddress; // ensure the artists signs only address(this) for each piece
        string artist;
        address wallet;
        string contents;
    }

    // type hashes
    bytes32 constant EIP712DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );

    bytes32 constant SIGNATURE_TYPEHASH =
        keccak256(
            "Signature(address verifyAddress,string artist,address wallet, string contents)"
        );

    bytes32 public DOMAIN_SEPARATOR;

    address public DAO;

    // Optional mapping for signatures
    mapping(uint256 => bytes) private _signatures;

    // the last nft minted
    uint256 public topId = 1;

    // A view to display the artist's address
    address public artist;

    // A signed token event
    event Signed(address indexed from, uint256 indexed tokenId);

    function _setDAO(address _daoAddress) internal virtual {
        require(_daoAddress != address(0));
        DAO = _daoAddress;
    }

    /**
     * @dev Sets `artist` as the original artist.
     * @param _artist the wallet of the signing artist (TODO consider multiple
     * signers and contract signers (non-EOA)
     */
    function _designateArtist(address _artist) internal virtual {
        require(
            artist == address(0),
            "ERC721Extensions: the artist has already been set"
        );

        // If there is no special designation for the artist, set it.
        artist = _artist;
    }

    /**
     * @dev Creates `tokenIds` representing the printed editions.
     * @param _editionSupply the number of prints
     */
    function _createEditions(
        string[] memory _tokenURI,
        uint256 _editionSupply,
        address _to
    ) internal virtual {
        require(
            _editionSupply > 0,
            "ERC721Extensions: the edition supply is not set to more than 0"
        );

        for (uint256 i = 0; i < _editionSupply; i++) {
            //0, 1+2
            _mint(_to, topId);
            _setTokenURI(topId, string(abi.encodePacked(_tokenURI[i])));
            topId++;
        }
    }

    /**
     * @dev internal hashing utility
     * @param _message the signature message struct to be signed
     * the address of this contract is enforced in the hashing
     */
    function _hash(Signature memory _message) internal view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    DOMAIN_SEPARATOR,
                    keccak256(
                        abi.encode(
                            SIGNATURE_TYPEHASH,
                            address(this),
                            _message.artist,
                            _message.wallet,
                            _message.contents
                        )
                    )
                )
            );
    }

    /**
     * @dev Signs a `tokenId` representing a print.
     * @param _tokenId id of the NFT being signed
     * @param _message the signed message
     * @param _signature signature bytes created off-chain
     *
     * Requirements:
     *
     * - `tokenId` must exist.
     *
     * Emits a {Signed} event.
     */
    function _signEdition(
        uint256 _tokenId,
        Signature memory _message,
        bytes memory _signature
    ) internal virtual {
        require(
            msg.sender == artist,
            "ERC721Extensions: only the artist may sign their work"
        );
        require(
            _signatures[_tokenId].length == 0,
            "ERC721Extensions: this token is already signed"
        );
        bytes32 digest = _hash(_message);
        address recovered = ECDSA.recover(digest, _signature);
        require(
            recovered == artist,
            "ERC721Extensions: artist signature mismatch"
        );
        _signatures[_tokenId] = _signature;
        emit Signed(artist, _tokenId);
    }

    /**
     * @dev displays a signature from the artist.
     * @param _tokenId NFT id to verify isSigned
     * @return bytes gets the signature stored on the token
     */
    function getSignature(uint256 _tokenId)
        external
        view
        virtual
        returns (bytes memory)
    {
        require(
            _signatures[_tokenId].length != 0,
            "ERC721Extensions: no signature exists for this Id"
        );
        return _signatures[_tokenId];
    }

    /**
     * @dev returns `true` if the message is signed by the artist.
     * @param _message the message signed by an artist and published elsewhere
     * @param _signature the signature on the message
     * @param _tokenId id of the token to be verified as being signed
     * @return bool true if signed by artist
     * The artist may broadcast signature out of band that will verify on the nft
     */
    function isSigned(
        Signature memory _message,
        bytes memory _signature,
        uint256 _tokenId
    ) external view virtual returns (bool) {
        bytes32 messageHash = _hash(_message);
        address _artist = ECDSA.recover(messageHash, _signature);
        return (_artist == artist &&
            _equals(_signatures[_tokenId], _signature));
    }

    /**
     * @dev Utility function that checks if two `bytes memory` variables are equal. This is done using hashing,
     * which is much more gas efficient then comparing each byte individually.
     * Equality means that:
     *  - 'self.length == other.length'
     *  - For 'n' in '[0, self.length)', 'self[n] == other[n]'
     */
    function _equals(bytes memory _self, bytes memory _other)
        internal
        pure
        returns (bool equal)
    {
        if (_self.length != _other.length) {
            return false;
        }
        uint256 addr;
        uint256 addr2;
        uint256 len = _self.length;
        assembly {
            addr := add(
                _self,
                /*BYTES_HEADER_SIZE*/
                32
            )
            addr2 := add(
                _other,
                /*BYTES_HEADER_SIZE*/
                32
            )
        }
        assembly {
            equal := eq(keccak256(addr, len), keccak256(addr2, len))
        }
    }
}
